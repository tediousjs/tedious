import java.io.PrintWriter;
import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Time;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import com.microsoft.sqlserver.jdbc.SQLServerColumnEncryptionJavaKeyStoreProvider;
import com.microsoft.sqlserver.jdbc.SQLServerPreparedStatement;
import com.microsoft.sqlserver.jdbc.SQLServerResultSet;

import microsoft.sql.DateTimeOffset;

/**
 * The JDBC side of the Always Encrypted compatibility checks between tedious
 * and the Microsoft JDBC Driver for SQL Server. See ../README.md, and
 * ../run.sh for how it is run.
 */
public class Interop {
  static final String TABLE = "interop";
  static final String KEY_PATH = "interop";

  // The row of a value of a column is `base + column * 100 + value`.
  static final int JDBC_BASE = 0;
  static final int TEDIOUS_BASE = 100000;
  static final int NULL_VALUE = 99;

  static final class Column {
    int index;
    String name, sql, kind, params, collation, writers;
    List<String> in = new ArrayList<>();
    List<String> out = new ArrayList<>();

    int param(int n) {
      return Integer.parseInt(params.split(",")[n]);
    }

    boolean writtenBy(String driver) {
      List<String> drivers = Arrays.asList(writers.split(","));
      return drivers.contains("all") || drivers.contains(driver);
    }
  }

  static String expand(String value) {
    if (value.equals("empty:")) {
      return "";
    }
    if (value.startsWith("repeat:")) {
      String[] parts = value.split(":", 3);
      return parts[1].repeat(Integer.parseInt(parts[2]));
    }
    return value;
  }

  static List<Column> loadSpec(String path) throws Exception {
    List<Column> columns = new ArrayList<>();
    for (String line : Files.readAllLines(Paths.get(path), StandardCharsets.UTF_8)) {
      if (line.isEmpty() || line.startsWith("#")) {
        continue;
      }
      String[] fields = line.split("\t", -1);
      Column column = new Column();
      column.index = columns.size();
      column.name = fields[0];
      column.sql = fields[1];
      column.kind = fields[2];
      column.params = fields[3];
      column.collation = fields[4];
      column.writers = fields[5];
      for (int i = 6; i < fields.length; i++) {
        String[] parts = fields[i].split("=>", 2);
        column.in.add(expand(parts[0]));
        column.out.add(expand(parts.length > 1 ? parts[1] : parts[0]));
      }
      columns.add(column);
    }
    return columns;
  }

  static String hex(byte[] bytes) {
    StringBuilder builder = new StringBuilder();
    for (byte b : bytes) {
      builder.append(String.format("%02x", b));
    }
    return builder.toString();
  }

  static byte[] unhex(String hex) {
    byte[] bytes = new byte[hex.length() / 2];
    for (int i = 0; i < bytes.length; i++) {
      bytes[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  static String shorten(String value) {
    return value == null ? "null" : value.length() > 60 ? value.substring(0, 60) + "... (" + value.length() + " chars)" : value;
  }

  // The JVM runs in UTC, so a time of day is its milliseconds since the epoch.
  static Time timeOf(String text) {
    return new Time(LocalTime.parse(text).toNanoOfDay() / 1_000_000);
  }

  static void set(SQLServerPreparedStatement ps, int i, Column column, String text) throws Exception {
    switch (column.kind) {
      case "bit": ps.setObject(i, text == null ? null : Boolean.valueOf(text.equals("1")), Types.BIT); break;
      case "tinyint": ps.setObject(i, text == null ? null : Short.valueOf(text), Types.TINYINT); break;
      case "smallint": ps.setObject(i, text == null ? null : Short.valueOf(text), Types.SMALLINT); break;
      case "int": ps.setObject(i, text == null ? null : Integer.valueOf(text), Types.INTEGER); break;
      case "bigint": ps.setObject(i, text == null ? null : Long.valueOf(text), Types.BIGINT); break;
      case "real": ps.setObject(i, text == null ? null : Float.valueOf(text), Types.REAL); break;
      case "float": ps.setObject(i, text == null ? null : Double.valueOf(text), Types.DOUBLE); break;
      case "decimal": ps.setBigDecimal(i, text == null ? null : new BigDecimal(text), column.param(0), column.param(1)); break;
      case "numeric": ps.setObject(i, text == null ? null : new BigDecimal(text), Types.NUMERIC, column.param(0), column.param(1)); break;
      case "money": ps.setMoney(i, text == null ? null : new BigDecimal(text)); break;
      case "smallmoney": ps.setSmallMoney(i, text == null ? null : new BigDecimal(text)); break;
      case "char": ps.setObject(i, text, Types.CHAR); break;
      case "varchar": case "varcharmax": ps.setString(i, text); break;
      case "nchar": ps.setObject(i, text, Types.NCHAR); break;
      case "nvarchar": case "nvarcharmax": ps.setNString(i, text); break;
      case "binary": ps.setObject(i, text == null ? null : unhex(text), Types.BINARY); break;
      case "varbinary": case "varbinarymax": ps.setBytes(i, text == null ? null : unhex(text)); break;
      case "date": ps.setDate(i, text == null ? null : java.sql.Date.valueOf(text)); break;
      case "time": ps.setTime(i, text == null ? null : timeOf(text), column.param(0)); break;
      case "datetime2": ps.setTimestamp(i, text == null ? null : Timestamp.valueOf(text), column.param(0)); break;
      case "datetimeoffset": ps.setDateTimeOffset(i, text == null ? null : DateTimeOffset.valueOf(Timestamp.valueOf(text), column.param(1)), column.param(0)); break;
      case "datetime": ps.setDateTime(i, text == null ? null : Timestamp.valueOf(text)); break;
      case "smalldatetime": ps.setSmallDateTime(i, text == null ? null : Timestamp.valueOf(text)); break;
      case "guid": ps.setUniqueIdentifier(i, text); break;
      default: throw new IllegalArgumentException("unknown kind " + column.kind);
    }
  }

  /** Returns null if the value of the result set is the expected one, a description of it otherwise. */
  static String mismatch(ResultSet rs, int i, Column column, String text) throws Exception {
    if (text == null) {
      Object value = rs.getObject(i);
      return value == null ? null : String.valueOf(value);
    }

    if (rs.getObject(i) == null) {
      return "null";
    }

    switch (column.kind) {
      case "bit": return rs.getBoolean(i) == text.equals("1") ? null : String.valueOf(rs.getBoolean(i));
      case "tinyint": case "smallint": case "int": return rs.getInt(i) == Integer.parseInt(text) ? null : String.valueOf(rs.getInt(i));
      case "bigint": return rs.getLong(i) == Long.parseLong(text) ? null : String.valueOf(rs.getLong(i));
      case "real": return rs.getFloat(i) == Float.parseFloat(text) ? null : String.valueOf(rs.getFloat(i));
      case "float": return rs.getDouble(i) == Double.parseDouble(text) ? null : String.valueOf(rs.getDouble(i));
      case "decimal": case "numeric": case "money": case "smallmoney":
        return rs.getBigDecimal(i).compareTo(new BigDecimal(text)) == 0 ? null : rs.getBigDecimal(i).toPlainString();
      case "char": case "nchar": {
        // Padded with spaces, to the length of the type in bytes.
        String value = rs.getString(i);
        return value.stripTrailing().equals(text) ? null : "\"" + value + "\"";
      }
      case "varchar": case "varcharmax": case "nvarchar": case "nvarcharmax":
        return rs.getString(i).equals(text) ? null : "\"" + rs.getString(i) + "\"";
      case "binary": {
        String padded = text + "0".repeat(column.param(0) * 2 - text.length());
        return hex(rs.getBytes(i)).equals(padded) ? null : hex(rs.getBytes(i));
      }
      case "varbinary": case "varbinarymax": return hex(rs.getBytes(i)).equals(text) ? null : hex(rs.getBytes(i));
      case "date": return rs.getDate(i).toString().equals(text) ? null : rs.getDate(i).toString();
      case "time": return rs.getTime(i).getTime() == timeOf(text).getTime() ? null : rs.getTime(i) + " (" + rs.getTime(i).getTime() + "ms)";
      case "datetime2": case "datetime": case "smalldatetime":
        return rs.getTimestamp(i).equals(Timestamp.valueOf(text)) ? null : rs.getTimestamp(i).toString();
      case "datetimeoffset": {
        DateTimeOffset value = ((SQLServerResultSet) rs).getDateTimeOffset(i);
        return value.getTimestamp().equals(Timestamp.valueOf(text)) && value.getMinutesOffset() == column.param(1) ? null : value.toString();
      }
      case "guid": return rs.getString(i).equalsIgnoreCase(text) ? null : rs.getString(i);
      default: throw new IllegalArgumentException("unknown kind " + column.kind);
    }
  }

  static String message(Throwable error) {
    return error.getClass().getSimpleName() + ": " + error.getMessage();
  }

  static String env(String name) {
    String value = System.getenv(name);
    if (value == null || value.isEmpty()) {
      throw new IllegalStateException("The environment variable " + name + " is not set. This program is run by test/interop/run.sh.");
    }
    return value;
  }

  static PrintWriter results;
  static int passed = 0;
  static int failed = 0;

  /**
   * Notes the outcome of a check: a line of the results file, that report.ts
   * compares with the known differences between the drivers.
   */
  static void record(String check, String column, int value, String error) {
    if (error == null) {
      passed++;
    } else {
      failed++;
    }

    String message = error == null ? "" : error.replaceAll("\\s+", " ");
    results.println(String.join("\t", env("INTEROP_SCENARIO"), "jdbc", check, column, value == NULL_VALUE ? "null" : String.valueOf(value), error == null ? "ok" : "fail",
        message.length() > 300 ? message.substring(0, 300) : message));
  }

  public static void main(String[] args) throws Exception {
    String mode = args[0];
    String keyStore = env("INTEROP_KEYSTORE");
    String keyStoreSecret = env("INTEROP_KEYSTORE_SECRET");

    if (mode.equals("wrap")) {
      // A new column encryption key, encrypted by the key store provider of the JDBC driver.
      byte[] columnEncryptionKey = new byte[32];
      new SecureRandom().nextBytes(columnEncryptionKey);

      SQLServerColumnEncryptionJavaKeyStoreProvider provider = new SQLServerColumnEncryptionJavaKeyStoreProvider(keyStore, keyStoreSecret.toCharArray());
      System.out.println(hex(provider.encryptColumnEncryptionKey(KEY_PATH, "RSA_OAEP", columnEncryptionKey)));
      return;
    }

    List<Column> columns = loadSpec(env("INTEROP_SPEC"));

    // The column master key is found in a key store file, by the key store
    // provider that the driver brings along.
    String url = "jdbc:sqlserver://" + env("INTEROP_HOST") + ":" + env("INTEROP_PORT") + ";databaseName=" + env("INTEROP_DATABASE") + ";"
        + "user=" + env("INTEROP_USER") + ";password={" + env("INTEROP_PASSWORD") + "};encrypt=true;trustServerCertificate=true;sendTimeAsDatetime=false;"
        + "columnEncryptionSetting=Enabled;keyStoreAuthentication=JavaKeyStorePassword;keyStoreLocation=" + keyStore + ";keyStoreSecret=" + keyStoreSecret;

    try (Connection connection = DriverManager.getConnection(url);
        PrintWriter writer = new PrintWriter(Files.newBufferedWriter(Paths.get(env("INTEROP_RESULTS")), StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND))) {
      results = writer;

      if (mode.equals("write")) {
        System.out.println(connection.getMetaData().getDriverName() + " " + connection.getMetaData().getDriverVersion()
            + ", Java " + System.getProperty("java.version") + ", default charset " + Charset.defaultCharset());
      }

      for (Column column : columns) {
        int values = column.in.size();

        if (mode.equals("write") && column.writtenBy("jdbc")) {
          // Each value, and a null
          for (int v = 0; v <= values; v++) {
            int value = v == values ? NULL_VALUE : v;
            String text = v == values ? null : column.in.get(v);

            String sql = "INSERT INTO " + TABLE + " (id, " + column.name + "_d, " + column.name + "_r) VALUES (?, ?, ?)";
            try (SQLServerPreparedStatement ps = (SQLServerPreparedStatement) connection.prepareStatement(sql)) {
              ps.setInt(1, JDBC_BASE + column.index * 100 + value);
              set(ps, 2, column, text);
              set(ps, 3, column, text);
              ps.executeUpdate();
              record("write", column.name, value, null);
            } catch (Throwable error) {
              record("write", column.name, value, "[" + column.sql + "] " + shorten(text) + ": " + message(error));
            }
          }
        }

        if (mode.equals("verify") && column.writtenBy("tedious")) {
          // Reads what tedious wrote.
          for (int v = 0; v <= values; v++) {
            int value = v == values ? NULL_VALUE : v;
            String expected = v == values ? null : column.out.get(v);

            String[] errors = new String[2];
            String sql = "SELECT " + column.name + "_d, " + column.name + "_r FROM " + TABLE + " WHERE id = ?";
            try (SQLServerPreparedStatement ps = (SQLServerPreparedStatement) connection.prepareStatement(sql)) {
              ps.setInt(1, TEDIOUS_BASE + column.index * 100 + value);
              try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                  errors[0] = errors[1] = "[" + column.sql + "] " + shorten(expected) + ": tedious did not write the row";
                } else {
                  for (int i = 0; i < 2; i++) {
                    String actual = mismatch(rs, i + 1, column, expected);
                    errors[i] = actual == null ? null : "[" + column.sql + "] expected " + shorten(expected) + ", got " + shorten(actual);
                  }
                }
              }
            } catch (Throwable error) {
              errors[0] = errors[1] = "[" + column.sql + "] " + shorten(expected) + ": " + message(error);
            }

            record("read", column.name + "_d", value, errors[0]);
            record("read", column.name + "_r", value, errors[1]);
          }

          // A lookup by a deterministically encrypted value finds what either driver wrote.
          if (column.writtenBy("jdbc")) {
            for (int v = 0; v < values; v++) {
              String sql = "SELECT id FROM " + TABLE + " WHERE " + column.name + "_d = ? ORDER BY id";
              List<Integer> expected = Arrays.asList(JDBC_BASE + column.index * 100 + v, TEDIOUS_BASE + column.index * 100 + v);

              try (SQLServerPreparedStatement ps = (SQLServerPreparedStatement) connection.prepareStatement(sql)) {
                set(ps, 1, column, column.in.get(v));

                List<Integer> ids = new ArrayList<>();
                try (ResultSet rs = ps.executeQuery()) {
                  while (rs.next()) {
                    ids.add(rs.getInt(1));
                  }
                }

                record("lookup", column.name + "_d", v, ids.containsAll(expected) ? null : "[" + column.sql + "] " + shorten(column.in.get(v)) + ": expected rows " + expected + ", found " + ids);
              } catch (Throwable error) {
                record("lookup", column.name + "_d", v, "[" + column.sql + "] " + shorten(column.in.get(v)) + ": " + message(error));
              }
            }
          }
        }
      }
    }

    System.out.println("jdbc " + mode + ": " + passed + " passed, " + failed + " failed");
  }
}

// The SqlClient side of the Always Encrypted compatibility checks between
// tedious and Microsoft.Data.SqlClient. See ../README.md, and ../run.sh for
// how it is run.
using System.Data;
using System.Globalization;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.SqlClient;

/// <summary>
/// A key store whose column master key is an RSA key in a PEM file: the key
/// store providers that SqlClient brings along need Windows or Azure. It reads
/// the envelope that Microsoft's key store providers store an encrypted
/// column encryption key in.
/// </summary>
class PemKeyStoreProvider : SqlColumnEncryptionKeyStoreProvider
{
    private readonly RSA rsa = RSA.Create();

    public PemKeyStoreProvider(string path)
    {
        rsa.ImportFromPem(File.ReadAllText(path));
    }

    public override byte[] DecryptColumnEncryptionKey(string masterKeyPath, string encryptionAlgorithm, byte[] encryptedColumnEncryptionKey)
    {
        // version | key path length | ciphertext length | key path | ciphertext | signature
        int keyPathLength = BitConverter.ToUInt16(encryptedColumnEncryptionKey, 1);
        int ciphertextLength = BitConverter.ToUInt16(encryptedColumnEncryptionKey, 3);
        int signedLength = 5 + keyPathLength + ciphertextLength;

        byte[] signedData = encryptedColumnEncryptionKey[..signedLength];
        byte[] signature = encryptedColumnEncryptionKey[signedLength..];
        if (!rsa.VerifyData(signedData, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1))
        {
            throw new CryptographicException("The signature of the encrypted column encryption key does not match.");
        }

        return rsa.Decrypt(encryptedColumnEncryptionKey[(5 + keyPathLength)..signedLength], RSAEncryptionPadding.OaepSHA1);
    }

    public override byte[] EncryptColumnEncryptionKey(string masterKeyPath, string encryptionAlgorithm, byte[] columnEncryptionKey)
    {
        throw new NotSupportedException();
    }
}

class Column
{
    public int Index;
    public string Name = "", Sql = "", Kind = "", Params = "", Writers = "";
    public List<string> In = new();
    public List<string> Out = new();

    public int Param(int n) => int.Parse(Params.Split(',')[n]);
    public bool WrittenBy(string driver) => Writers.Split(',').Contains("all") || Writers.Split(',').Contains(driver);
}

static class Interop
{
    const string Table = "interop";
    const string Provider = "TEDIOUS_INTEROP";

    // The row of a value of a column is `base + column * 100 + value`.
    const int SqlClientBase = 0;
    const int TediousBase = 100000;
    const int NullValue = 99;

    static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;

    static string Expand(string value)
    {
        if (value == "empty:")
        {
            return "";
        }
        if (value.StartsWith("repeat:"))
        {
            int last = value.LastIndexOf(':');
            return string.Concat(Enumerable.Repeat(value[7..last], int.Parse(value[(last + 1)..])));
        }
        return value;
    }

    static List<Column> LoadSpec(string path)
    {
        var columns = new List<Column>();
        foreach (string line in File.ReadAllLines(path, Encoding.UTF8))
        {
            if (line.Length == 0 || line.StartsWith('#'))
            {
                continue;
            }

            string[] fields = line.Split('\t');
            var column = new Column { Index = columns.Count, Name = fields[0], Sql = fields[1], Kind = fields[2], Params = fields[3], Writers = fields[5] };
            foreach (string field in fields.Skip(6))
            {
                string[] parts = field.Split("=>", 2);
                column.In.Add(Expand(parts[0]));
                column.Out.Add(Expand(parts.Length > 1 ? parts[1] : parts[0]));
            }
            columns.Add(column);
        }
        return columns;
    }

    static string Shorten(string? value) => value == null ? "null" : value.Length > 60 ? value[..60] + $"... ({value.Length} chars)" : value;

    static string Message(Exception error) => error.GetType().Name + ": " + error.Message;

    static string Env(string name)
    {
        string? value = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrEmpty(value))
        {
            throw new InvalidOperationException($"The environment variable {name} is not set. This program is run by test/interop/run.sh.");
        }
        return value;
    }

    static StreamWriter results = StreamWriter.Null;
    static int passed = 0;
    static int failed = 0;

    /// <summary>
    /// Notes the outcome of a check: a line of the results file, that
    /// report.ts compares with the known differences between the drivers.
    /// </summary>
    static void Record(string check, string column, int value, string? error = null)
    {
        if (error == null)
        {
            passed++;
        }
        else
        {
            failed++;
        }

        string message = string.Join(" ", (error ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        results.WriteLine(string.Join("\t", Env("INTEROP_SCENARIO"), "sqlclient", check, column, value == NullValue ? "null" : value.ToString(Invariant), error == null ? "ok" : "fail",
            message.Length > 300 ? message[..300] : message));
    }

    static DateTime ParseDateTime(string text) =>
        DateTime.ParseExact(text, new[] { "yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm:ss.FFFFFFF" }, Invariant, DateTimeStyles.None);

    static TimeSpan ParseTime(string text) =>
        TimeSpan.ParseExact(text, new[] { @"hh\:mm\:ss", @"hh\:mm\:ss\.FFFFFFF" }, Invariant);

    /// <summary>The parameter that holds a value of a column.</summary>
    static SqlParameter Parameter(string name, Column column, string? text)
    {
        var parameter = new SqlParameter { ParameterName = name };
        object? value = null;

        switch (column.Kind)
        {
            case "bit": parameter.SqlDbType = SqlDbType.Bit; if (text != null) value = text == "1"; break;
            case "tinyint": parameter.SqlDbType = SqlDbType.TinyInt; if (text != null) value = byte.Parse(text); break;
            case "smallint": parameter.SqlDbType = SqlDbType.SmallInt; if (text != null) value = short.Parse(text); break;
            case "int": parameter.SqlDbType = SqlDbType.Int; if (text != null) value = int.Parse(text); break;
            case "bigint": parameter.SqlDbType = SqlDbType.BigInt; if (text != null) value = long.Parse(text); break;
            case "real": parameter.SqlDbType = SqlDbType.Real; if (text != null) value = float.Parse(text, Invariant); break;
            case "float": parameter.SqlDbType = SqlDbType.Float; if (text != null) value = double.Parse(text, Invariant); break;
            case "decimal":
            case "numeric":
                parameter.SqlDbType = SqlDbType.Decimal;
                parameter.Precision = (byte)column.Param(0);
                parameter.Scale = (byte)column.Param(1);
                if (text != null) value = decimal.Parse(text, Invariant);
                break;
            case "money": parameter.SqlDbType = SqlDbType.Money; if (text != null) value = decimal.Parse(text, Invariant); break;
            case "smallmoney": parameter.SqlDbType = SqlDbType.SmallMoney; if (text != null) value = decimal.Parse(text, Invariant); break;
            case "char": parameter.SqlDbType = SqlDbType.Char; parameter.Size = column.Param(0); value = text; break;
            case "varchar": parameter.SqlDbType = SqlDbType.VarChar; parameter.Size = column.Param(0); value = text; break;
            case "varcharmax": parameter.SqlDbType = SqlDbType.VarChar; parameter.Size = -1; value = text; break;
            case "nchar": parameter.SqlDbType = SqlDbType.NChar; parameter.Size = column.Param(0); value = text; break;
            case "nvarchar": parameter.SqlDbType = SqlDbType.NVarChar; parameter.Size = column.Param(0); value = text; break;
            case "nvarcharmax": parameter.SqlDbType = SqlDbType.NVarChar; parameter.Size = -1; value = text; break;
            case "binary": parameter.SqlDbType = SqlDbType.Binary; parameter.Size = column.Param(0); if (text != null) value = Convert.FromHexString(text); break;
            case "varbinary": parameter.SqlDbType = SqlDbType.VarBinary; parameter.Size = column.Param(0); if (text != null) value = Convert.FromHexString(text); break;
            case "varbinarymax": parameter.SqlDbType = SqlDbType.VarBinary; parameter.Size = -1; if (text != null) value = Convert.FromHexString(text); break;
            case "date": parameter.SqlDbType = SqlDbType.Date; if (text != null) value = DateTime.ParseExact(text, "yyyy-MM-dd", Invariant); break;
            case "time": parameter.SqlDbType = SqlDbType.Time; parameter.Scale = (byte)column.Param(0); if (text != null) value = ParseTime(text); break;
            case "datetime2": parameter.SqlDbType = SqlDbType.DateTime2; parameter.Scale = (byte)column.Param(0); if (text != null) value = ParseDateTime(text); break;
            case "datetimeoffset":
                parameter.SqlDbType = SqlDbType.DateTimeOffset;
                parameter.Scale = (byte)column.Param(0);
                // The value of the spec is the point in time, in UTC.
                if (text != null) value = new DateTimeOffset(DateTime.SpecifyKind(ParseDateTime(text), DateTimeKind.Utc)).ToOffset(TimeSpan.FromMinutes(column.Param(1)));
                break;
            case "datetime": parameter.SqlDbType = SqlDbType.DateTime; if (text != null) value = ParseDateTime(text); break;
            case "smalldatetime": parameter.SqlDbType = SqlDbType.SmallDateTime; if (text != null) value = ParseDateTime(text); break;
            case "guid": parameter.SqlDbType = SqlDbType.UniqueIdentifier; if (text != null) value = Guid.Parse(text); break;
            default: throw new ArgumentException("unknown kind " + column.Kind);
        }

        parameter.Value = value ?? DBNull.Value;
        return parameter;
    }

    static string Describe(object value) => value switch
    {
        DBNull => "null",
        byte[] bytes => Convert.ToHexString(bytes).ToLowerInvariant(),
        DateTime dateTime => dateTime.ToString("yyyy-MM-dd HH:mm:ss.fffffff", Invariant),
        DateTimeOffset offset => offset.ToString("yyyy-MM-dd HH:mm:ss.fffffff zzz", Invariant),
        TimeSpan time => time.ToString("c", Invariant),
        string text => "\"" + text + "\"",
        IFormattable formattable => formattable.ToString(null, Invariant),
        _ => value.ToString() ?? ""
    };

    /// <summary>Returns null if a value that was read is the expected one, a description of it otherwise.</summary>
    static string? Mismatch(Column column, object value, string? text)
    {
        if (text == null || value is DBNull)
        {
            return text == null && value is DBNull ? null : Describe(value);
        }

        bool equal = column.Kind switch
        {
            "bit" => (bool)value == (text == "1"),
            "tinyint" => (byte)value == byte.Parse(text),
            "smallint" => (short)value == short.Parse(text),
            "int" => (int)value == int.Parse(text),
            "bigint" => (long)value == long.Parse(text),
            "real" => (float)value == float.Parse(text, Invariant),
            "float" => (double)value == double.Parse(text, Invariant),
            "decimal" or "numeric" or "money" or "smallmoney" => (decimal)value == decimal.Parse(text, Invariant),
            // Padded with spaces, to the length of the type in bytes.
            "char" or "nchar" => ((string)value).TrimEnd(' ') == text,
            "varchar" or "varcharmax" or "nvarchar" or "nvarcharmax" => (string)value == text,
            "binary" => Convert.ToHexString((byte[])value).ToLowerInvariant() == text.PadRight(column.Param(0) * 2, '0'),
            "varbinary" or "varbinarymax" => Convert.ToHexString((byte[])value).ToLowerInvariant() == text,
            "date" => ((DateTime)value).ToString("yyyy-MM-dd", Invariant) == text,
            "time" => (TimeSpan)value == ParseTime(text),
            "datetime2" or "datetime" or "smalldatetime" => (DateTime)value == ParseDateTime(text),
            "datetimeoffset" => ((DateTimeOffset)value).UtcDateTime == ParseDateTime(text) && ((DateTimeOffset)value).Offset == TimeSpan.FromMinutes(column.Param(1)),
            "guid" => (Guid)value == Guid.Parse(text),
            _ => throw new ArgumentException("unknown kind " + column.Kind)
        };

        return equal ? null : Describe(value);
    }

    static int Main(string[] args)
    {
        string mode = args[0];
        List<Column> columns = LoadSpec(Env("INTEROP_SPEC"));

        SqlConnection.RegisterColumnEncryptionKeyStoreProviders(new Dictionary<string, SqlColumnEncryptionKeyStoreProvider>
        {
            [Provider] = new PemKeyStoreProvider(Env("INTEROP_KEY"))
        });

        var builder = new SqlConnectionStringBuilder
        {
            DataSource = Env("INTEROP_HOST") + "," + Env("INTEROP_PORT"),
            InitialCatalog = Env("INTEROP_DATABASE"),
            UserID = Env("INTEROP_USER"),
            Password = Env("INTEROP_PASSWORD"),
            Encrypt = true,
            TrustServerCertificate = true,
            ColumnEncryptionSetting = SqlConnectionColumnEncryptionSetting.Enabled
        };

        using var connection = new SqlConnection(builder.ConnectionString);
        connection.Open();

        using var writer = new StreamWriter(Env("INTEROP_RESULTS"), append: true, new UTF8Encoding(false));
        results = writer;

        if (mode == "write")
        {
            string version = typeof(SqlConnection).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "";
            Console.WriteLine($"Microsoft.Data.SqlClient {version.Split('+')[0]}, .NET {Environment.Version}");
        }

        foreach (Column column in columns)
        {
            int values = column.In.Count;

            if (mode == "write" && column.WrittenBy("sqlclient"))
            {
                // Each value, and a null
                for (int v = 0; v <= values; v++)
                {
                    int value = v == values ? NullValue : v;
                    string? text = v == values ? null : column.In[v];

                    try
                    {
                        using var command = new SqlCommand($"INSERT INTO {Table} (id, {column.Name}_d, {column.Name}_r) VALUES (@id, @d, @r)", connection);
                        command.Parameters.Add(new SqlParameter("@id", SqlDbType.Int) { Value = SqlClientBase + column.Index * 100 + value });
                        command.Parameters.Add(Parameter("@d", column, text));
                        command.Parameters.Add(Parameter("@r", column, text));
                        command.ExecuteNonQuery();
                        Record("write", column.Name, value);
                    }
                    catch (Exception error)
                    {
                        Record("write", column.Name, value, $"[{column.Sql}] {Shorten(text)}: {Message(error)}");
                    }
                }
            }

            if (mode == "verify" && column.WrittenBy("tedious"))
            {
                // Reads what tedious wrote.
                for (int v = 0; v <= values; v++)
                {
                    int value = v == values ? NullValue : v;
                    string? expected = v == values ? null : column.Out[v];

                    var errors = new string?[2];
                    try
                    {
                        using var command = new SqlCommand($"SELECT {column.Name}_d, {column.Name}_r FROM {Table} WHERE id = @id", connection);
                        command.Parameters.Add(new SqlParameter("@id", SqlDbType.Int) { Value = TediousBase + column.Index * 100 + value });

                        using SqlDataReader reader = command.ExecuteReader();
                        if (!reader.Read())
                        {
                            errors[0] = errors[1] = $"[{column.Sql}] {Shorten(expected)}: tedious did not write the row";
                        }
                        else
                        {
                            for (int i = 0; i < 2; i++)
                            {
                                string? actual = Mismatch(column, reader.GetValue(i), expected);
                                errors[i] = actual == null ? null : $"[{column.Sql}] expected {Shorten(expected)}, got {Shorten(actual)}";
                            }
                        }
                    }
                    catch (Exception error)
                    {
                        errors[0] = errors[1] = $"[{column.Sql}] {Shorten(expected)}: {Message(error)}";
                    }

                    Record("read", column.Name + "_d", value, errors[0]);
                    Record("read", column.Name + "_r", value, errors[1]);
                }

                // A lookup by a deterministically encrypted value finds what either driver wrote.
                if (column.WrittenBy("sqlclient"))
                {
                    for (int v = 0; v < values; v++)
                    {
                        int[] expected = { SqlClientBase + column.Index * 100 + v, TediousBase + column.Index * 100 + v };

                        try
                        {
                            using var command = new SqlCommand($"SELECT id FROM {Table} WHERE {column.Name}_d = @value ORDER BY id", connection);
                            command.Parameters.Add(Parameter("@value", column, column.In[v]));

                            var ids = new List<int>();
                            using (SqlDataReader reader = command.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    ids.Add(reader.GetInt32(0));
                                }
                            }

                            Record("lookup", column.Name + "_d", v, expected.All(ids.Contains) ? null : $"[{column.Sql}] {Shorten(column.In[v])}: expected rows {string.Join(", ", expected)}, found {string.Join(", ", ids)}");
                        }
                        catch (Exception error)
                        {
                            Record("lookup", column.Name + "_d", v, $"[{column.Sql}] {Shorten(column.In[v])}: {Message(error)}");
                        }
                    }
                }
            }
        }

        Console.WriteLine($"sqlclient {mode}: {passed} passed, {failed} failed");
        return 0;
    }
}

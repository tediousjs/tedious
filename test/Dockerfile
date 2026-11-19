# Overridden in CI to also run the tests against the Azure SQL Database
# container (`mcr.microsoft.com/mssql/azure-sql-db-server`).
ARG MSSQL_IMAGE=mcr.microsoft.com/mssql/server:2025-latest
FROM ${MSSQL_IMAGE}

USER mssql
COPY --chown=mssql:root ./fixtures/mssql.conf /var/opt/mssql/mssql.conf
COPY --chown=mssql:root ./fixtures/mssql.crt /var/opt/mssql/mssql.crt
COPY --chown=mssql:root ./fixtures/mssql.key /var/opt/mssql/mssql.key

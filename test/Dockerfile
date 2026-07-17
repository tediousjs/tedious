FROM mcr.microsoft.com/mssql/server:2025-latest

USER mssql
COPY --chown=mssql:root ./fixtures/mssql.conf /var/opt/mssql/mssql.conf
COPY --chown=mssql:root ./fixtures/mssql.crt /var/opt/mssql/mssql.crt
COPY --chown=mssql:root ./fixtures/mssql.key /var/opt/mssql/mssql.key

FROM mcr.microsoft.com/mssql/server:2022-latest

USER mssql
COPY --chown=mssql:root ./fixtures/mssql.conf /var/opt/mssql/mssql.conf
COPY --chown=mssql:root ./fixtures/localhost.pem /var/opt/mssql/localhost.pem
COPY --chown=mssql:root ./fixtures/localhost.key /var/opt/mssql/localhost.key

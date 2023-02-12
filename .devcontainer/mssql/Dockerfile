FROM mcr.microsoft.com/mssql/server:2022-latest

USER mssql
COPY --chown=mssql:root ./mssql.conf /var/opt/mssql/mssql.conf
COPY --chown=mssql:root ./mssql.pem /var/opt/mssql/mssql.pem
COPY --chown=mssql:root ./mssql.key /var/opt/mssql/mssql.key

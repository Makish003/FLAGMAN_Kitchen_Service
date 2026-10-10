FROM node:22-alpine AS ui
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY backend/Flagman.Api.csproj backend/
RUN dotnet restore backend/Flagman.Api.csproj
COPY backend/ backend/
COPY --from=ui /src/backend/wwwroot/ backend/wwwroot/
RUN dotnet publish backend/Flagman.Api.csproj -c Release -o /app --no-restore
COPY tools/Flagman.Maintenance/ tools/Flagman.Maintenance/
RUN dotnet publish tools/Flagman.Maintenance/Flagman.Maintenance.csproj -c Release -o /maintenance

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/ ./
COPY --from=build /maintenance/ /maintenance/
RUN mkdir -p /data && chown -R 1654:1654 /data /app
USER 1654
ENV ASPNETCORE_URLS=http://+:8080 FLAGMAN_DB=/data/flagman.db FLAGMAN_DEMO=false
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=6s --start-period=30s --retries=3 CMD ["dotnet", "Flagman.Api.dll", "--healthcheck"]
ENTRYPOINT ["dotnet", "Flagman.Api.dll"]

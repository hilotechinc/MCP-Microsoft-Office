# Azure Deployment Guide

## Prerequisites
- Azure CLI installed and authenticated
- Visual Studio subscription with credits
- Custom domain nstop.no configured in Azure
- GitHub repository with the code

## Step 1: Create Azure Web App

```bash
# Create resource group
az group create --name mcp-microsoft-office-rg --location "West Europe"

# Create App Service Plan
az appservice plan create --name mcp-microsoft-office-plan --resource-group mcp-microsoft-office-rg --sku B1 --is-linux

# Create Web App
az webapp create --resource-group mcp-microsoft-office-rg --plan mcp-microsoft-office-plan --name mcp-microsoft-office --runtime "NODE|18-lts"
```

## Step 2: Configure Environment Variables

```bash
# Set environment variables in Azure App Service
az webapp config appsettings set --resource-group mcp-microsoft-office-rg --name mcp-microsoft-office --settings \
  MICROSOFT_CLIENT_ID="6c9b2994-b11f-4a62-83a2-219210cc927c" \
  MICROSOFT_TENANT_ID="facf3dd7-5092-42e2-bea6-1a201d58b8f6" \
  MICROSOFT_REDIRECT_URI="https://mcp.nstop.no/api/auth/callback" \
  STATIC_JWT_SECRET="$(openssl rand -base64 32)" \
  JWT_SECRET="$(openssl rand -base64 32)" \
  MCP_BEARER_TOKEN_EXPIRY="24h" \
  DEVICE_REGISTRY_ENCRYPTION_KEY="$(openssl rand -base64 32 | head -c 32)" \
  NODE_ENV="production" \
  HOST="0.0.0.0" \
  PORT="80" \
  SERVER_URL="https://mcp.nstop.no/" \
  DOMAIN="mcp.nstop.no" \
  LLM_PROVIDER="openai" \
  OPENAI_API_KEY="your_openai_api_key_here" \
  CLAUDE_API_KEY="your_claude_api_key_here"
```

## Step 3: Configure Custom Domain

```bash
# Add custom domain
az webapp config hostname add --webapp-name mcp-microsoft-office --resource-group mcp-microsoft-office-rg --hostname mcp.nstop.no

# Enable HTTPS
az webapp config set --resource-group mcp-microsoft-office-rg --name mcp-microsoft-office --https-only true

# Create SSL certificate (if not using Azure managed certificate)
az webapp config ssl create --resource-group mcp-microsoft-office-rg --name mcp-microsoft-office --hostname mcp.nstop.no
```

## Step 4: Set up GitHub Actions CI/CD

1. Get the publish profile:
```bash
az webapp deployment list-publishing-profiles --resource-group mcp-microsoft-office-rg --name mcp-microsoft-office --xml
```

2. Add the publish profile as a secret named `AZURE_WEBAPP_PUBLISH_PROFILE` in your GitHub repository settings.

3. Update the app name in `.github/workflows/azure-deploy.yml` if different.

## Step 5: Configure GitHub Repository

1. Go to your GitHub repository settings
2. Navigate to Secrets and variables → Actions
3. Add the following secrets:
   - `AZURE_WEBAPP_PUBLISH_PROFILE`: The publish profile from Step 4
   - Any additional API keys if needed

## Step 6: Deploy

Push to the main branch to trigger automatic deployment via GitHub Actions.

## DNS Configuration

Ensure your domain registrar points mcp.nstop.no to your Azure Web App:

```
Type: CNAME
Name: mcp
Value: mcp-microsoft-office.azurewebsites.net
```

## Monitoring

```bash
# View logs
az webapp log tail --resource-group mcp-microsoft-office-rg --name mcp-microsoft-office

# View deployment logs
az webapp deployment log list --resource-group mcp-microsoft-office-rg --name mcp-microsoft-office
```

## Environment Variables Security

Never commit sensitive environment variables to the repository. All secrets should be configured in Azure App Service Configuration or GitHub Secrets.
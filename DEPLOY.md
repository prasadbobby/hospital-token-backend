# Production Deployment Guide

## 🚀 Quick Deploy Checklist

### 1. Environment Setup
```bash
# Generate strong JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Copy and configure .env
cp .env.example .env
# Edit .env with your production values
```

### 2. Security Verification
```bash
# Audit dependencies
npm audit --production

# Check for security issues
npm run security-check
```

### 3. Database Setup
```bash
# Seed initial data (first time only)
npm run seed
```

### 4. Start Production Server
```bash
# Build (if needed)
npm run build

# Start with PM2 (recommended)
pm2 start src/index.js --name pulse-opd-backend

# Or start directly
npm start
```

## 📋 Pre-Deployment Checklist

- [ ] Strong JWT_SECRET configured (64+ characters)
- [ ] Firebase credentials configured
- [ ] NODE_ENV=production
- [ ] CORS origins configured
- [ ] SSL/TLS certificates installed
- [ ] Firewall rules configured
- [ ] Database backups enabled
- [ ] Monitoring tools configured
- [ ] Error logging configured (Sentry/similar)
- [ ] Health checks working

## 🔒 Security Hardening

1. **Never expose .env file**
2. **Use environment-specific secrets**
3. **Enable firewall (only ports 80, 443, 3001)**
4. **Regular security updates**
5. **Monitor logs for suspicious activity**

## ⚠️ CRITICAL: Known Issues

See SECURITY.md for full list. Must address before production:

1. Add token revocation mechanism
2. Implement transaction support for atomic operations
3. Add comprehensive audit logging
4. Fix race conditions in token generation
5. Enforce RBAC on all endpoints

## 📊 Monitoring

Health endpoint: `GET /api/health`
Database health: `GET /api/health/db`

Set up monitoring alerts for:
- Response time > 1s
- Error rate > 1%
- Failed auth attempts > 10/min
- Database connection failures

##  Scaling

For high traffic:
1. Use load balancer (nginx/HAProxy)
2. Enable Redis for session storage
3. Implement caching layer
4. Database connection pooling
5. Horizontal scaling with PM2 cluster mode

```bash
pm2 start src/index.js -i max --name pulse-opd-backend
```

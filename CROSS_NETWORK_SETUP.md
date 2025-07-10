# Cross-Network Connectivity Setup Guide

This guide explains how to connect Stremio addons to HyperStreamrr instances across different networks (local network, internet, VPN, etc.).

## Architecture Overview

```
[Stremio Device] ←→ [Stremio Addon] ←→ [Network] ←→ [HyperStreamrr Instance] ←→ [P2P Networks]
```

## Setup Methods

### Method 1: Local Network Connection

**Use Case**: Stremio and HyperStreamrr on the same local network

**Steps**:
1. Find HyperStreamrr's local IP address
2. Note the auth key from HyperStreamrr console logs
3. Configure Stremio addon with local IP

**Configuration**:
```bash
# Environment variables
export HYPERSTREAMRR_LOCAL_HOST="192.168.1.100"
export HYPERSTREAMRR_LOCAL_PORT="8080"
export HYPERSTREAMRR_LOCAL_AUTH_KEY="your-auth-key-from-logs"
```

**Advantages**: Simple, fast, no port forwarding needed
**Limitations**: Only works on same network

### Method 2: Internet Connection (Port Forwarding)

**Use Case**: Access HyperStreamrr from anywhere on the internet

**Steps**:
1. Configure port forwarding on your router:
   - Forward port 8080 (WebSocket) to HyperStreamrr device
   - Forward port 9080 (HTTP streaming) to HyperStreamrr device
2. Enable remote access in HyperStreamrr
3. Configure Stremio addon with public IP/domain

**HyperStreamrr Configuration**:
```javascript
// In browser console or settings
localStorage.setItem('hyperstreamrr_remote_access', 'true');
localStorage.setItem('hyperstreamrr_auth_key', 'your-secure-key');
```

**Router Configuration**:
- External Port 8080 → Internal IP:8080 (WebSocket)
- External Port 9080 → Internal IP:9080 (HTTP streaming)

**Stremio Addon Configuration**:
```bash
export HYPERSTREAMRR_INSTANCES='[{
  "id": "remote-home",
  "name": "Home Server", 
  "host": "your-public-ip.example.com",
  "port": 8080,
  "authKey": "your-secure-key",
  "secure": false
}]'
```

**Security Considerations**:
- Use strong, unique auth keys
- Consider using VPN instead for better security
- Monitor connection logs
- Use firewall rules to limit access

### Method 3: VPN Connection

**Use Case**: Secure access across networks using VPN

**Steps**:
1. Set up VPN server (WireGuard, OpenVPN, etc.)
2. Connect both devices to VPN
3. Use VPN IP addresses for connection

**Advantages**: Secure, encrypted, acts like local network
**Limitations**: Requires VPN setup and maintenance

### Method 4: Reverse Proxy/Tunnel

**Use Case**: No port forwarding possible, using services like ngrok, cloudflare tunnel

**Steps using ngrok**:
```bash
# On HyperStreamrr device
ngrok http 8080
# Note the generated URL (e.g., abc123.ngrok.io)
```

**Stremio Addon Configuration**:
```bash
export HYPERSTREAMRR_INSTANCES='[{
  "id": "tunnel",
  "name": "Tunneled Instance",
  "host": "abc123.ngrok.io", 
  "port": 443,
  "authKey": "your-auth-key",
  "secure": true
}]'
```

## Security Best Practices

### Authentication Keys
- Generate strong, unique keys (32+ characters)
- Rotate keys regularly
- Never share keys in plain text
- Store securely (environment variables, encrypted config)

### Network Security
- Use HTTPS/WSS for internet connections
- Implement rate limiting
- Monitor for suspicious activity
- Use VPN when possible

### Firewall Configuration
```bash
# Example iptables rules (Linux)
# Allow specific IP ranges only
iptables -A INPUT -p tcp --dport 8080 -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 8080 -j DROP
```

## Troubleshooting

### Connection Issues

**Problem**: "Failed to connect to HyperStreamrr"
**Solutions**:
1. Check network connectivity: `ping target-host`
2. Verify ports are open: `telnet target-host 8080`
3. Check firewall settings
4. Verify auth key matches
5. Check HyperStreamrr logs for errors

**Problem**: "Authentication failed"
**Solutions**:
1. Verify auth key is correct
2. Check for typos in configuration
3. Ensure HyperStreamrr is running with tunnel enabled

**Problem**: "Stream not working"
**Solutions**:
1. Check HTTP streaming port (9080) accessibility
2. Verify file exists and is accessible
3. Check video format compatibility
4. Monitor network bandwidth

### Performance Issues

**Problem**: Slow streaming
**Solutions**:
1. Check network bandwidth
2. Ensure direct P2P connections are working
3. Consider local caching
4. Use lower quality streams if available

### Multiple Instances

**Problem**: Managing multiple HyperStreamrr instances
**Solutions**:
1. Use descriptive names for each instance
2. Keep track of auth keys securely
3. Test connections individually
4. Use health checks to monitor status

## Configuration Examples

### Home + Office Setup
```json
{
  "instances": [
    {
      "id": "home",
      "name": "Home Server",
      "host": "home.example.com",
      "port": 8080,
      "authKey": "home-auth-key",
      "secure": true
    },
    {
      "id": "office", 
      "name": "Office Server",
      "host": "office.company.com",
      "port": 8080,
      "authKey": "office-auth-key",
      "secure": true
    }
  ]
}
```

### VPN Network Setup
```json
{
  "instances": [
    {
      "id": "vpn-home",
      "name": "Home (VPN)",
      "host": "10.8.0.10",
      "port": 8080,
      "authKey": "vpn-home-key",
      "secure": false
    },
    {
      "id": "vpn-friend",
      "name": "Friend (VPN)", 
      "host": "10.8.0.20",
      "port": 8080,
      "authKey": "friend-vpn-key",
      "secure": false
    }
  ]
}
```

## Monitoring and Maintenance

### Health Checks
The addon automatically monitors connection health:
- Heartbeat every 30 seconds
- Automatic reconnection on failure
- Connection status logging

### Logs to Monitor
- Authentication attempts
- Connection failures
- Streaming errors
- Performance metrics

### Regular Maintenance
- Update auth keys periodically
- Check for software updates
- Monitor network usage
- Review security logs

## Advanced Scenarios

### Load Balancing Multiple Instances
The addon can connect to multiple instances simultaneously and distribute requests for better performance and redundancy.

### Content Discovery Across Networks
When multiple instances are connected, the addon aggregates content from all available networks, providing a unified catalog in Stremio.

### Failover Support
If one instance becomes unavailable, the addon automatically fails over to other connected instances for uninterrupted service.

## Support and Resources

- **Configuration Generator**: Use the provided config.example.json as a template
- **Connection Testing**: Check connection status in addon logs
- **Community Support**: Join HyperStreamrr community for help with complex setups
- **Security Updates**: Keep both HyperStreamrr and the addon updated

Remember: Security should always be your top priority when exposing services to the internet. Use strong authentication, monitor access, and prefer VPN connections when possible.
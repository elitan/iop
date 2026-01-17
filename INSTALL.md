# frost

> Simple deployment platform. Docker-only, single-user.

I want you to install Frost for me. Execute all steps below autonomously.

## OBJECTIVE

Provision a VPS and install the Frost deployment platform.

## DONE WHEN

- Frost dashboard accessible via browser at `http://<server-ip>:3000`
- User has saved: server IP, SSH private key, Frost admin password

## TODO

- [ ] Ask user to choose cloud provider
- [ ] Guide user to create account and get API token
- [ ] Ask about SSH key preference
- [ ] Provision VPS via provider API
- [ ] Wait for server ready
- [ ] SSH in and run install script
- [ ] Display credentials for user to save

---

## PROVIDER SELECTION

Ask user which cloud provider to use. Suggest options like Hetzner, DigitalOcean, Vultr, Linode, AWS Lightsail, or let them specify another.

Once provider is chosen, use web search to find:
- Current pricing for smallest 2GB+ RAM instance
- API documentation URL
- API endpoint for creating servers
- API endpoint for adding SSH keys
- Available regions

---

## SERVER REQUIREMENTS

Minimum specs:
- 2GB RAM
- Ubuntu 24.04
- Public IPv4

---

## SSH KEY OPTIONS

Ask user:
1. **Generate new key (recommended)** - Generate ED25519 keypair, add public key to server, give user private key to save
2. **Use existing key** - User provides their public key

---

## PROVISIONING

For the chosen provider:
1. Use web search to find API docs and exact curl commands
2. Guide user to create API token in provider console
3. Add SSH key via API
4. Create server via API (smallest instance with 2GB+ RAM, Ubuntu 24.04)
5. Poll status endpoint until server is ready
6. Test SSH connectivity before proceeding

---

## INSTALLATION

Generate a random password for Frost admin (16+ chars, alphanumeric).

SSH into server and run:

```bash
ssh -o StrictHostKeyChecking=no root@{server_ip} \
  "curl -fsSL https://raw.githubusercontent.com/elitan/frost/main/install.sh -o /tmp/install.sh && chmod +x /tmp/install.sh && echo '{password}' | /tmp/install.sh"
```

Verify Frost is running:

```bash
curl -s -o /dev/null -w "%{http_code}" http://{server_ip}:3000
# Should return 200
```

---

## IMPORTANT: SAVE THIS INFO

Display this to user and ask them to save it:

```
=== FROST SERVER CREDENTIALS ===
Provider: {provider}
Server ID: {server_id}
Server IP: {server_ip}
SSH User: root
SSH Private Key:
{private_key_or_"your existing key"}

Frost URL: http://{server_ip}:3000
Frost Password: {password}

API Token (for server management): {token}
================================
```

---

## CLEANUP (Optional)

To delete the server and stop billing, use web search to find the provider's API delete endpoint and execute it with the server ID.

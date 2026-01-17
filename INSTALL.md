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

Ask user which provider to use:

### Hetzner (Recommended)

Best value. ~€5/month.

- 2 vCPU, 2GB RAM, 40GB NVMe SSD
- Regions: Germany, Finland, USA, Singapore
- Console: console.hetzner.cloud

### DigitalOcean

Popular choice, good docs. ~$12-18/month.

- 1-2 vCPU, 2GB RAM, 50-60GB SSD
- Regions: NYC, SFO, AMS, SGP, LON, FRA, TOR, BLR, SYD
- Console: cloud.digitalocean.com

### Vultr

Most global regions. ~$10/month.

- 1 vCPU, 2GB RAM, 55GB SSD
- Regions: 32 worldwide
- Console: my.vultr.com

---

## SSH KEY OPTIONS

Ask user with recommendation:

1. **Generate new key (recommended)** - Generate ED25519 keypair, add public key to server, give user private key to save
2. **Use existing key** - User provides their public key

---

## PROVIDER SETUP GUIDES

### Hetzner Setup

1. Go to console.hetzner.cloud
2. Create account or sign in
3. Create a new project (or use default)
4. Go to Security → API Tokens
5. Generate API Token with Read & Write permissions
6. Copy the token

### DigitalOcean Setup

1. Go to cloud.digitalocean.com
2. Create account or sign in
3. Go to API → Tokens
4. Generate New Token with Read & Write scope
5. Copy the token

### Vultr Setup

1. Go to my.vultr.com
2. Create account or sign in
3. Go to Account → API
4. Enable API and copy the API Key

---

## PROVISIONING STEPS

### Hetzner

```bash
# Add SSH key
curl -X POST "https://api.hetzner.cloud/v1/ssh_keys" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"name":"frost-key","public_key":"{public_key}"}'
# Save ssh_key.id from response

# Create server
curl -X POST "https://api.hetzner.cloud/v1/servers" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "frost",
    "server_type": "cpx11",
    "image": "ubuntu-24.04",
    "location": "nbg1",
    "ssh_keys": [{ssh_key_id}]
  }'
# Save server.id and server.public_net.ipv4.ip from response
```

Locations: `nbg1` (Nuremberg), `fsn1` (Falkenstein), `hel1` (Helsinki), `ash` (Ashburn), `hil` (Hillsboro)

### DigitalOcean

```bash
# Add SSH key
curl -X POST "https://api.digitalocean.com/v2/account/keys" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"name":"frost-key","public_key":"{public_key}"}'
# Save ssh_key.id from response

# Create droplet
curl -X POST "https://api.digitalocean.com/v2/droplets" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "frost",
    "region": "nyc1",
    "size": "s-1vcpu-2gb",
    "image": "ubuntu-24-04-x64",
    "ssh_keys": [{ssh_key_id}]
  }'
# Save droplet.id from response

# Get IP (poll until networks.v4 has public IP)
curl "https://api.digitalocean.com/v2/droplets/{droplet_id}" \
  -H "Authorization: Bearer {token}"
```

Regions: `nyc1`, `nyc3`, `sfo3`, `ams3`, `sgp1`, `lon1`, `fra1`, `tor1`, `blr1`, `syd1`

### Vultr

```bash
# Add SSH key
curl -X POST "https://api.vultr.com/v2/ssh-keys" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"name":"frost-key","ssh_key":"{public_key}"}'
# Save ssh_key.id from response

# Get OS ID for Ubuntu 24.04
curl "https://api.vultr.com/v2/os" -H "Authorization: Bearer {token}"
# Find Ubuntu 24.04 LTS x64, save id (typically 2284)

# Create instance
curl -X POST "https://api.vultr.com/v2/instances" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "region": "ewr",
    "plan": "vc2-1c-2gb",
    "os_id": 2284,
    "label": "frost",
    "sshkey_id": ["{ssh_key_id}"]
  }'
# Save instance.id and instance.main_ip from response
```

Popular regions: `ewr` (New Jersey), `lax` (Los Angeles), `ams` (Amsterdam), `fra` (Frankfurt), `sgp` (Singapore), `syd` (Sydney)

---

## WAIT FOR SERVER

Poll server status until ready (status = "running" or "active"). Usually 30-60 seconds.

Test SSH connectivity before proceeding:

```bash
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no root@{server_ip} "echo ready"
```

Retry every 10 seconds until successful.

---

## INSTALLATION

Generate a random password for Frost admin (16+ chars, alphanumeric).

SSH into server and run:

```bash
ssh -o StrictHostKeyChecking=no root@{server_ip} \
  "curl -fsSL https://raw.githubusercontent.com/elitan/frost/main/install.sh -o /tmp/install.sh && chmod +x /tmp/install.sh && echo '{password}' | /tmp/install.sh"
```

Wait for installation to complete (2-3 minutes).

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

To delete the server and stop billing:

### Hetzner

```bash
curl -X DELETE "https://api.hetzner.cloud/v1/servers/{server_id}" \
  -H "Authorization: Bearer {token}"
```

### DigitalOcean

```bash
curl -X DELETE "https://api.digitalocean.com/v2/droplets/{droplet_id}" \
  -H "Authorization: Bearer {token}"
```

### Vultr

```bash
curl -X DELETE "https://api.vultr.com/v2/instances/{instance_id}" \
  -H "Authorization: Bearer {token}"
```

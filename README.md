# HyperShare - Pear App

A P2P file sharing application with curated networks, running as a Pear Desktop app.

## Installation

```bash
# Install dependencies
npm install

# Run the app
pear run --dev .
```

## Features

- **Network Creation**: Create isolated file-sharing groups
- **Permission System**: Admins can publish, readers can browse/download
- **Rich Metadata**: Categories, tags, descriptions for drives
- **File Search**: Search across all published drives
- **Direct P2P**: No servers, fully decentralized

## Usage

### First Run
1. Choose "Create Network" to start a new group
2. Or "Join Network" with an invite code

### Creating a Network
1. Enter network name and description
2. You become the founder admin
3. Share the invite codes:
   - **Admin invite**: For trusted uploaders
   - **Reader invite**: For everyone else

### Publishing Files (Admins Only)
1. Go to Admin → Publish Drive
2. Upload files
3. Add metadata (name, description, tags)
4. Click Publish

### Browsing & Downloading
1. Browse all published drives
2. Click to see files
3. Download directly via P2P

## Architecture

```
Pear App (app.js)
    ├── Autobase (shared index)
    │   └── HyperDB (metadata)
    ├── Hyperdrives (file storage)
    └── Hyperswarm (networking)
```

## Network Keys

Each network is identified by its autobase key. Save your network keys to rejoin later!

## Storage

All data is stored in Pear's config directory:
- Network metadata: `networks.json`
- Network data: `networks/<id>/`

## Development

The app consists of:
- `app.js` - Core P2P logic
- `index.html` - UI
- `package.json` - Pear configuration

No build step required - just run with Pear!
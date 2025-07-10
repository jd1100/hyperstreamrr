# HyperStreamrr Stremio Addon

This addon allows you to access your HyperStreamrr P2P networks directly from Stremio, enabling seamless streaming of content from your decentralized networks.

## Features

- **Network Discovery**: Automatically discovers available HyperStreamrr networks
- **Content Cataloging**: Organizes movies and series from your P2P networks
- **Real-time Streaming**: Direct streaming from HyperStreamrr to Stremio
- **Search Integration**: Search across all your networks from Stremio
- **Metadata Extraction**: Automatically extracts titles, years, and categories from filenames
- **Secure Connection**: Uses WebSocket tunnel to securely connect to your desktop HyperStreamrr instance

## Installation

1. Make sure you have Node.js installed
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start your HyperStreamrr desktop application
2. Start the Stremio addon:
   ```bash
   npm start
   ```
3. The addon will be available at `http://localhost:7000`
4. In Stremio, go to Settings → Addons → Add addon URL
5. Enter: `http://localhost:7000/manifest.json`
6. Install the addon

## Configuration

The addon connects to HyperStreamrr using WebSocket on port 8080 by default. You can configure this in the addon code:

```javascript
const hyperStreamrr = new HyperStreamrrConnection('localhost', 8080);
```

## How It Works

### Architecture

```
[Stremio] ←→ [Stremio Addon] ←→ [WebSocket] ←→ [HyperStreamrr Desktop] ←→ [P2P Networks]
```

### Connection Flow

1. **Initialization**: The addon connects to HyperStreamrr via WebSocket
2. **Network Discovery**: Requests available networks and drives
3. **Content Cataloging**: Scans all video files and creates Stremio-compatible metadata
4. **Streaming**: Creates HTTP streaming endpoints for Stremio to consume

### Content Organization

- **Movies**: Detected by filename patterns (year in parentheses, no season/episode indicators)
- **Series**: Detected by season/episode patterns (S01E01, Season 1, etc.)
- **Metadata**: Extracted from filenames including title, year, and quality indicators

## API Reference

### WebSocket Messages

#### Get Networks
```javascript
{
  "method": "getNetworks",
  "id": 1
}
```

#### Get Drives
```javascript
{
  "method": "getDrives",
  "id": 2,
  "params": { "networkKey": "abc123..." }
}
```

#### Get Files
```javascript
{
  "method": "getFiles",
  "id": 3,
  "params": { "driveKey": "def456...", "path": "/" }
}
```

#### Search Files
```javascript
{
  "method": "searchFiles",
  "id": 4,
  "params": { "query": "avengers", "filters": {} }
}
```

#### Get Stream URL
```javascript
{
  "method": "getStreamUrl",
  "id": 5,
  "params": { "driveKey": "def456...", "filePath": "/movies/movie.mp4" }
}
```

## Development

### Running in Development Mode

```bash
npm run dev
```

This uses nodemon to automatically restart the server when files change.

### Adding New Features

1. **New Content Types**: Extend the `categorizeContent` function
2. **Enhanced Metadata**: Improve the `extractMetadata` function
3. **Additional Filters**: Add more catalog filters in the manifest
4. **Better Search**: Enhance the search functionality

### Debugging

Enable debug logging:
```javascript
const DEBUG = true;
```

## Troubleshooting

### Common Issues

1. **"Failed to connect to HyperStreamrr"**
   - Make sure HyperStreamrr desktop app is running
   - Check if WebSocket server is enabled on port 8080
   - Verify firewall settings

2. **"No content found"**
   - Ensure you have networks created in HyperStreamrr
   - Check if drives are published with video content
   - Verify file extensions are supported

3. **"Stream not working"**
   - Check if the HTTP streaming server is running on port 9080
   - Verify the file exists and is accessible
   - Check Stremio's network settings

### Performance Tips

- The addon caches content for 30 seconds to improve performance
- Large networks may take longer to scan initially
- Use specific search terms for better results

## Security

- The addon only connects to localhost by default
- Uses secure WebSocket connections
- Stream URLs are temporary and expire after 1 hour
- No user data is stored permanently

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details
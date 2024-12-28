# bitwarden-env-sync

A CLI tool to sync environment files with Bitwarden secure notes.

## Installation & Usage

### Option 1: Run from source

1. Install dependencies:

```bash
bun install
```

2. Run the CLI:

```bash
bun run src/index.ts
```

### Option 2: Use pre-built binary

1. Download the latest `bw-env-sync` binary from the [GitHub Actions artifacts](https://github.com/YOUR_USERNAME/bitwarden-env-sync/actions)
2. Make it executable:

```bash
chmod +x bw-env-sync
```

3. Run the CLI:

```bash
./bw-env-sync
```

## Configuration

### Self-hosted Bitwarden Server

If you're using a self-hosted Bitwarden server, you need to configure the server URL before using the CLI:

```bash
# Verify the configuration
bw config server https://your-bitwarden-server.com
```

## Features

- Syncs environment files to Bitwarden secure notes
- Supports glob patterns for finding env files
- Automatically updates existing entries or creates new ones
- Organization support via `-o` or `--organization` flag
- Compatible with self-hosted Bitwarden servers

## Usage Examples

1. Basic usage (will prompt for organization ID):

```bash
./bw-env-sync
```

2. Specify organization ID via flag:

```bash
./bw-env-sync --organization=YOUR_ORG_ID
```

The tool will:

1. Prompt for your Bitwarden password
2. Ask for a glob pattern to find env files (defaults to `**/.env*(!(.example))`)
3. Sync all matching files to your Bitwarden vault

## Development

This project uses [Bun](https://bun.sh) as its runtime. To build the binary:

```bash
bun run build
```

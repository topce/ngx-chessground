# Lichess Download Script

This script downloads Lichess broadcast `.zst` files from `https://database.lichess.org/broadcast/` to your local file system.

## Usage

### Download a single month
```bash
npm run download-lichess -- <year> <month>
```

Example:
```bash
npm run download-lichess -- 2022 1
```

### Download a range of months
```bash
npm run download-lichess -- <year> <startMonth> <endMonth>
```

Example:
```bash
npm run download-lichess -- 2022 1 3
```

### Download all available months
Downloads all months from January 2020 to the previous month:
```bash
npm run download-lichess -- all
```

## File Storage

Downloaded files are stored in:
```
public/lichess/broadcast/
```

Files follow the naming pattern:
```
lichess_db_broadcast_YYYY-MM.pgn.zst
```

## How It Works

1. The script downloads `.zst` files from Lichess database
2. Files are saved to `public/lichess/broadcast/`
3. Angular dev server serves these files as static assets
4. The PGN viewer loads files from `/lichess/broadcast/` (local files instead of remote proxy)

## Notes

- Files that already exist will be skipped
- Progress is shown during download
- The script will report any download failures
- Downloaded files are excluded from git (see `.gitignore`)

# Score Tracker Flask Application

A simple Flask application that listens for HTTP GET requests to store user scores in JSON files.

## Features

- Accepts GET requests at `/results?user=xxx&time=yyy`
- Stores results in JSON files named `{username}.json`
- Each entry maps submission date to time score
- Includes health check endpoint
- Ready for production deployment with gunicorn and systemd

## API Endpoints

### Store Results
```
GET /results?user=username&time=123
```

**Parameters:**
- `user` (required): Username (string)
- `time` (required): Time score (integer)

**Response:**
```json
{
  "status": "success",
  "message": "Result stored for user username",
  "data": {
    "user": "username",
    "time": 123,
    "submission_date": "2024-01-01T12:00:00.000000"
  }
}
```

### Health Check
```
GET /health
```

### Service Info
```
GET /
```

## Setup and Deployment

### 1. Install Dependencies

```bash
cd /var/www/html/manchat/generated-crosswords/scoretracker
uv sync
```

### 2. Test Locally

```bash
uv run python app.py
```

The app will run on `http://localhost:5001`

### 3. Production Deployment

#### Install the systemd service:

```bash
# Copy service file to systemd directory
sudo cp scoretracker.service /etc/systemd/system/

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable scoretracker

# Start the service
sudo systemctl start scoretracker

# Check status
sudo systemctl status scoretracker
```

#### Configure Nginx

Add this location block to your Nginx configuration for the `manchat.men` domain:

```nginx
location /results {
    proxy_pass http://127.0.0.1:5001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 4. File Permissions

Ensure proper permissions for the data directory:

```bash
sudo chown -R www-data:www-data /var/www/html/manchat/generated-crosswords/scoretracker
sudo chmod -R 755 /var/www/html/manchat/generated-crosswords/scoretracker
```

## Data Storage

User scores are stored in the `data/` directory as JSON files:

```
data/
├── alice.json
├── bob.json
└── charlie.json
```

Each file contains entries in the format:
```json
{
  "2024-01-01T12:00:00.000000": 123,
  "2024-01-01T12:30:00.000000": 456
}
```

## Service Management

```bash
# Start service
sudo systemctl start scoretracker

# Stop service
sudo systemctl stop scoretracker

# Restart service
sudo systemctl restart scoretracker

# Check status
sudo systemctl status scoretracker

# View logs
sudo journalctl -u scoretracker -f
```

## Command-Line Utilities

### Edit Player Time

Use `edit_time.py` to edit a player's time for a specific date:

```bash
# Using positional arguments
python edit_time.py <player> <date> <time>

# Using named arguments
python edit_time.py --player <player> --date <date> --time <time>

# Skip confirmation prompt (useful for scripts)
python edit_time.py --player alice --date 2024-01-15 --time 300 --confirm
```

**Examples:**
```bash
# Edit alice's time on 2024-01-15 to 300 seconds
python edit_time.py alice 2024-01-15 300

# Edit bob's time on 2024-01-15 to 250 seconds
python edit_time.py --player bob --date 2024-01-15 --time 250
```

The utility will:
- Show the current time (if it exists) before making changes
- Prompt for confirmation (unless `--confirm` is used)
- Create a new record if the player doesn't have a time for that date
- Update the existing record if one already exists

## Example Usage

```bash
# Store a result for user 'alice' with time 150
curl "http://manchat.men/results?user=alice&time=150"

# Check service health
curl "http://manchat.men/health"
```

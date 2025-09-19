# Generated Crosswords

A web-based crossword puzzle platform featuring interactive crossword solving with timer functionality, score tracking, and an archive system for historical puzzles.

## Project Components

### Web Frontend (`/`)

- **`index.html`** - Simple landing page with navigation to the mini crossword
- **`crossword.html`** - Main interactive crossword puzzle interface with:
  - Dynamic crossword grid rendering
  - Timer functionality with start/pause controls
  - Real-time feedback and autocheck features
  - Leaderboard integration
  - Share functionality for completed puzzles
  - Archive access for historical puzzles
- **`archive.html`** - Archive browser displaying available crossword puzzles with date filtering

### Web Assets (`/`)

- **`crossword.js`** - Core crossword puzzle JavaScript library providing:
  - Interactive grid navigation and input handling
  - Timer management and persistence
  - User progress tracking and validation
  - Leaderboard functionality with score submission
  - Cookie-based user preferences
  - Dynamic puzzle loading from JSON data
- **`archive.js`** - Archive browser functionality for navigating historical puzzles
- **`statistics.js`** - Statistics page functionality for viewing user performance data
- **`crossword.css`** - Styling for the crossword interface with responsive design
- **`css/`** - Additional CSS modules for specific components (animations, layout, etc.)

### Puzzle Data (`/crosswords/`)

Contains JSON files with crossword puzzle data in a structured format:
- **`mini_YYYY-MM-DD.json`** - Daily mini crossword puzzles from 2014
- Each file contains puzzle metadata, grid dimensions, cell data, clues, and answers

### Crossword Generator (`/crossword-generator/`)

Python-based crossword puzzle generation system:
- **`crossword_generator.py`** - Main script for generating crossword puzzles
- **`extract_clues.py`** - Utility for extracting clues from crossword data
- **`master_clues.json`** - Master database of crossword clues and answers
- **`pyproject.toml`** - Python project configuration with dependencies

### Score Tracker API (`/scoretracker/`)

A Flask-based web service for storing and managing user completion times:

- **`app.py`** - Flask application with endpoints:
  - `GET /results?user=username&time=123` - Store user completion times
  - `GET /crosswords` - List available crossword JSON files
  - `GET /health` - Health check endpoint
- **`pyproject.toml`** - Python project configuration with dependencies
- **`scoretracker.service`** - Systemd service configuration for production deployment
- **Data storage**: Creates date-based JSON files (`YYYY-MM-DD.json`) with user scores

## Getting Started

### Prerequisites

- Python 3.8+ (for scoretracker)
- Web server or local development server
- Modern web browser with JavaScript support

### Running the Score Tracker

The score tracker is a Flask application that stores user completion times.

#### Development Mode

```bash
cd scoretracker
uv sync
uv run python app.py
```

The service will run on `http://localhost:5001`

#### Production Deployment

For production deployment with systemd:

```bash
# Install dependencies
cd scoretracker
uv sync

# Copy and enable systemd service
sudo cp scoretracker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable scoretracker
sudo systemctl start scoretracker

# Check status
sudo systemctl status scoretracker
```

### Running a Local Web Server

To test the crossword interface locally, you can use any static web server:

#### Using Python's built-in server:

```bash
# Python 3
python -m http.server 8000

# Access at http://localhost:8000
```

#### Using Node.js http-server:

```bash
# Install globally
npm install -g http-server

# Run in project directory
http-server -p 8000

# Access at http://localhost:8000
```

### Accessing the Crosswords

1. Open your browser to the local server (e.g., `http://localhost:8000`)
2. Click "Mini crossword" to access the puzzle interface
3. Navigate to the archive to browse historical puzzles
4. Use URL parameters to load specific puzzles: `crossword.html?puzzle=mini_2014-08-21.json`

## Features

- **Interactive Grid**: Click-to-select cells with keyboard navigation
- **Timer System**: Accurate timing with pause/resume functionality
- **Auto-checking**: Optional real-time answer validation
- **Leaderboards**: Score submission and daily leaderboard viewing
- **Archive System**: Browse and play historical crossword puzzles
- **Responsive Design**: Works on desktop and mobile devices
- **User Persistence**: Remembers user preferences via cookies

## API Integration

The crossword interface integrates with external APIs:
- Score submission to the score tracker service
- Dynamic crossword list fetching for the archive
- Real-time leaderboard data

## File Structure

```
generated-crosswords/
├── README.md                    # This file
├── index.html                   # Landing page
├── crossword.html              # Main crossword interface
├── archive.html                # Puzzle archive browser
├── statistics.html             # Statistics page
├── favicon.ico                 # Site favicon
├── crossword.js                # Core crossword functionality
├── archive.js                  # Archive browser functionality
├── statistics.js               # Statistics page functionality
├── crossword.css               # Main crossword styling
├── css/                        # Additional CSS modules
│   ├── animations.css
│   ├── layout.css
│   └── ...
├── crossword-generator/
│   ├── crossword_generator.py  # Python crossword generator
│   ├── extract_clues.py        # Clue extraction utility
│   ├── master_clues.json       # Master clues database
│   └── pyproject.toml          # Python dependencies
├── crosswords/
│   ├── mini_2014-08-21.json   # Crossword puzzle data
│   └── ...                    # Additional puzzle files
└── scoretracker/
    ├── app.py                 # Flask score tracking API
    ├── pyproject.toml         # Python dependencies
    ├── scoretracker.service   # Systemd service config
    └── README.md              # Detailed scoretracker documentation
```

## Contributing

When making changes to the puzzle interface:
- Modify JavaScript and CSS files in the root directory for frontend changes
- Update puzzle data in `/crosswords/` for new crossword content
- Modify Python generator code in `/crossword-generator/` for puzzle generation changes
- Test changes with a local web server before deployment

For score tracker modifications, see the detailed documentation in `/scoretracker/README.md`.

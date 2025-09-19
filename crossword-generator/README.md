# Crossword Generator

A Python program that generates new 5x5 crosswords based on clue/answer combinations from existing crossword puzzles.

## Features

- Extracts clue/answer pairs from JSON crossword files
- Generates valid 5x5 crossword puzzles with the following constraints:
  - No more than 6 empty squares
  - No repeated answers
  - Proper word intersections

## Setup

This project uses `uv` for package management. Make sure you have `uv` installed, then:

```bash
# Create and activate virtual environment
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies (if any are added later)
uv pip install -e .
```

## Usage

### Quick Start

Generate a single crossword:
```bash
python crossword_generator.py
```

### Advanced Usage

```bash
# Generate 5 crosswords
python crossword_generator.py --count 5

# Force re-extraction of clues and generate 3 crosswords  
python crossword_generator.py --extract --count 3

# Show help
python crossword_generator.py --help
```

### Individual Scripts

You can also run the clue extraction separately:

```bash
# Extract clues from JSON files to master_clues.json
python extract_clues.py
```

## How It Works

1. **Clue Extraction**: The program scans all JSON files in the `../crosswords` directory and extracts clue/answer pairs, building a master list saved as `master_clues.json`. The list contains tuples of (clue, answer) pairs, allowing multiple answers for the same clue while filtering out relational clues that start with "See ".

2. **Crossword Generation**: Using the extracted clues, the generator:
   - Starts with a random word in the center of a 5x5 grid
   - Attempts to place intersecting words that share common letters
   - Validates that the final puzzle meets the constraints
   - Retries until a valid puzzle is found (or maximum attempts reached)

## File Structure

- `crossword_generator.py` - Main script containing all crossword generation functionality
- `extract_clues.py` - Utility script for extracting clue/answer pairs from JSON files
- `pyproject.toml` - Project configuration and dependencies
- `master_clues.json` - Generated file containing all extracted clue/answer pairs as a list of tuples

## Requirements

- Python 3.8+
- JSON crossword files in `../crosswords` directory
- `tqdm` for progress bars during generation

## Validation Rules

Generated crosswords must satisfy:
- 5x5 grid size
- Maximum 6 empty squares (black squares)
- No repeated answers across the entire puzzle
- Minimum word length of 3 characters
- Proper word intersections (words must share letters where they cross)
- **All letter sequences must be valid words**: Every contiguous sequence of 3+ letters (horizontal or vertical) must correspond to a valid answer from the clue database. During generation, only complete 5-letter sequences are validated to avoid premature rejection of valid placements.

## Development

Optional development dependencies can be installed:
```bash
uv pip install -e ".[dev]"
```

This includes tools for testing, formatting, and type checking.

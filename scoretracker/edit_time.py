#!/usr/bin/env python3
"""
Command-line utility to edit or delete a player's time for a specific date.

Usage:
    python edit_time.py <player> <date> <time>
    python edit_time.py --player <player> --date <date> --time <time>
    python edit_time.py --player <player> --date <date> --delete

Examples:
    python edit_time.py alice 2024-01-15 300
    python edit_time.py --player bob --date 2024-01-15 --time 250
    python edit_time.py --player alice --date 2024-01-15 --delete
"""

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


# Database path - matches app.py
DATA_DIR = Path(__file__).parent / ".." / "data"
DB_PATH = DATA_DIR / "statistics.db"


def get_db_connection():
    """Get a connection to the SQLite database."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """Initialize the SQLite database with the results table."""
    conn = get_db_connection()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS results (
                date TEXT NOT NULL,
                username TEXT NOT NULL,
                time INTEGER NOT NULL,
                PRIMARY KEY (date, username)
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_date ON results(date)
        """)
        conn.commit()
    finally:
        conn.close()


def validate_date(date_str):
    """Validate that the date string is in YYYY-MM-DD format."""
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return True
    except ValueError:
        return False


def get_current_time(player, date):
    """Get the current time for a player on a specific date."""
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT time FROM results WHERE date = ? AND username = ?",
            (date, player)
        ).fetchone()
        return row['time'] if row else None
    finally:
        conn.close()


def edit_time(player, date, new_time):
    """
    Edit a player's time for a specific date.
    
    Args:
        player: Username (string)
        date: Date in YYYY-MM-DD format (string)
        new_time: New time value (integer)
    
    Returns:
        tuple: (success: bool, message: str, old_time: int or None)
    """
    # Initialize database if it doesn't exist
    init_database()
    
    # Validate date format
    if not validate_date(date):
        return False, f"Invalid date format: {date}. Expected YYYY-MM-DD format.", None
    
    # Validate time is an integer
    try:
        new_time = int(new_time)
        if new_time < 0:
            return False, f"Time must be a non-negative integer, got: {new_time}", None
    except ValueError:
        return False, f"Time must be an integer, got: {new_time}", None
    
    # Get current time (if exists)
    old_time = get_current_time(player, date)
    
    # Update or insert the record
    conn = get_db_connection()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO results (date, username, time) VALUES (?, ?, ?)",
            (date, player, new_time)
        )
        conn.commit()
        
        if old_time is not None:
            message = f"Updated {player}'s time on {date} from {old_time} to {new_time}"
        else:
            message = f"Created new record for {player} on {date} with time {new_time}"
        
        return True, message, old_time
    except Exception as e:
        conn.rollback()
        return False, f"Database error: {str(e)}", old_time
    finally:
        conn.close()


def delete_time(player, date):
    """
    Delete a player's time for a specific date.
    
    Args:
        player: Username (string)
        date: Date in YYYY-MM-DD format (string)
    
    Returns:
        tuple: (success: bool, message: str, old_time: int or None)
    """
    # Initialize database if it doesn't exist
    init_database()
    
    # Validate date format
    if not validate_date(date):
        return False, f"Invalid date format: {date}. Expected YYYY-MM-DD format.", None
    
    # Get current time (if exists)
    old_time = get_current_time(player, date)
    
    if old_time is None:
        return False, f"No record found for {player} on {date}", None
    
    # Delete the record
    conn = get_db_connection()
    try:
        cursor = conn.execute(
            "DELETE FROM results WHERE date = ? AND username = ?",
            (date, player)
        )
        conn.commit()
        
        if cursor.rowcount > 0:
            message = f"Deleted {player}'s time on {date} (was {old_time})"
            return True, message, old_time
        else:
            return False, f"No record found for {player} on {date}", old_time
    except Exception as e:
        conn.rollback()
        return False, f"Database error: {str(e)}", old_time
    finally:
        conn.close()


def main():
    """Main entry point for the command-line utility."""
    parser = argparse.ArgumentParser(
        description="Edit or delete a player's time for a specific date",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s alice 2024-01-15 300
  %(prog)s --player bob --date 2024-01-15 --time 250
  %(prog)s --player charlie --date 2024-01-15 --time 180 --confirm
  %(prog)s --player alice --date 2024-01-15 --delete
  %(prog)s bob 2024-01-15 --delete
        """
    )
    
    parser.add_argument(
        'player',
        nargs='?',
        help='Player username'
    )
    parser.add_argument(
        'date',
        nargs='?',
        help='Date in YYYY-MM-DD format'
    )
    parser.add_argument(
        'time',
        nargs='?',
        type=int,
        help='New time value (integer, not required when using --delete)'
    )
    
    parser.add_argument(
        '--player',
        dest='player_flag',
        help='Player username (alternative to positional argument)'
    )
    parser.add_argument(
        '--date',
        dest='date_flag',
        help='Date in YYYY-MM-DD format (alternative to positional argument)'
    )
    parser.add_argument(
        '--time',
        dest='time_flag',
        type=int,
        help='New time value (alternative to positional argument, not required when using --delete)'
    )
    parser.add_argument(
        '--delete',
        action='store_true',
        help='Delete the player\'s time for the selected date'
    )
    parser.add_argument(
        '--confirm',
        action='store_true',
        help='Skip confirmation prompt (useful for scripts)'
    )
    
    args = parser.parse_args()
    
    # Use flag arguments if provided, otherwise use positional arguments
    player = args.player_flag or args.player
    date = args.date_flag or args.date
    time_value = args.time_flag if args.time_flag is not None else args.time
    
    # Validate required arguments
    if not player:
        parser.error("Player username is required (use --player or positional argument)")
    if not date:
        parser.error("Date is required (use --date or positional argument)")
    
    # If --delete is set, handle deletion
    if args.delete:
        # Get current time for confirmation
        old_time = get_current_time(player, date)
        
        # Show what will happen
        if old_time is not None:
            print(f"Current time for {player} on {date}: {old_time}")
            print(f"This record will be deleted.")
        else:
            print(f"No existing record for {player} on {date}")
            print("Nothing to delete.")
            sys.exit(0)
        
        # Confirm unless --confirm flag is set
        if not args.confirm:
            response = input("\nProceed with deletion? (yes/no): ").strip().lower()
            if response not in ('yes', 'y'):
                print("Operation cancelled.")
                sys.exit(0)
        
        # Perform the deletion
        success, message, _ = delete_time(player, date)
        
        if success:
            print(f"\n✓ {message}")
            sys.exit(0)
        else:
            print(f"\n✗ Error: {message}", file=sys.stderr)
            sys.exit(1)
    
    # Otherwise, handle edit (time is required)
    if time_value is None:
        parser.error("Time is required when not using --delete (use --time or positional argument)")
    
    # Get current time for confirmation
    old_time = get_current_time(player, date)
    
    # Show what will happen
    if old_time is not None:
        print(f"Current time for {player} on {date}: {old_time}")
        print(f"New time: {time_value}")
    else:
        print(f"No existing record for {player} on {date}")
        print(f"Will create new record with time: {time_value}")
    
    # Confirm unless --confirm flag is set
    if not args.confirm:
        response = input("\nProceed with this change? (yes/no): ").strip().lower()
        if response not in ('yes', 'y'):
            print("Operation cancelled.")
            sys.exit(0)
    
    # Perform the edit
    success, message, _ = edit_time(player, date, time_value)
    
    if success:
        print(f"\n✓ {message}")
        sys.exit(0)
    else:
        print(f"\n✗ Error: {message}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
Complete crossword generator script that handles the entire workflow:
1. Extract clue/answer pairs from JSON files
2. Generate new 5x5 crosswords using those pairs
"""

import argparse
import json
import random
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import List, Set, Tuple

from extract_clues import build_master_clue_list
from tqdm import tqdm


class Direction(Enum):
    ACROSS = "across"
    DOWN = "down"


@dataclass
class Word:
    text: str
    row: int
    col: int
    direction: Direction
    clue: str
    quality: int = 2  # Default to quality 2 for backwards compatibility


@dataclass
class CrosswordGrid:
    width: int = 5
    height: int = 5
    grid: List[List[str]] = None
    words: List[Word] = None
    # Cache for expensive calculations
    _cached_sequences: List[Tuple[str, int, int, Direction]] = None
    _cached_placed_words: Set[Tuple[str, int, int, Direction]] = None
    _cached_used_answers: Set[str] = None
    _cached_empty_squares: int = None
    _cached_invalid_sequences: int = None

    def __post_init__(self):
        if self.grid is None:
            self.grid = [["." for _ in range(self.width)] for _ in range(self.height)]
        if self.words is None:
            self.words = []
        # Initialize cache
        self._invalidate_cache()

    def _invalidate_cache(self):
        """Invalidate all cached values when grid or words change."""
        self._cached_sequences = None
        self._cached_placed_words = None
        self._cached_used_answers = None
        self._cached_empty_squares = None
        self._cached_invalid_sequences = None

    @property
    def size(self):
        """For backwards compatibility, return the maximum dimension."""
        return max(self.width, self.height)

    def is_valid_placement(
        self,
        word: str,
        row: int,
        col: int,
        direction: Direction,
        available_answers: Set[str] = None,
    ) -> bool:
        """Check if a word can be placed at the given position."""
        if direction == Direction.ACROSS:
            if col + len(word) > self.width:
                return False
            # Check for conflicts
            for i, char in enumerate(word):
                grid_char = self.grid[row][col + i]
                if grid_char != "." and grid_char != char:
                    return False
            # Check boundaries to prevent adjacent words
            if col > 0 and self.grid[row][col - 1] != ".":
                return False
            if col + len(word) < self.width and self.grid[row][col + len(word)] != ".":
                return False
        else:  # DOWN
            if row + len(word) > self.height:
                return False
            # Check for conflicts
            for i, char in enumerate(word):
                grid_char = self.grid[row + i][col]
                if grid_char != "." and grid_char != char:
                    return False
            # Check boundaries to prevent adjacent words
            if row > 0 and self.grid[row - 1][col] != ".":
                return False
            if row + len(word) < self.height and self.grid[row + len(word)][col] != ".":
                return False

        # If available_answers is provided, do a more thorough check
        # Only validate when we have complete sequences (full width/height)
        if available_answers is not None:
            # OPTIMIZATION: Instead of creating a temporary grid and CrosswordGrid object,
            # we can directly check for new sequences that would be created by this placement
            # This avoids the expensive temporary object creation and method calls
            
            # Check for new sequences that would be created by this word placement
            new_sequences = self._get_new_sequences_from_placement(word, row, col, direction)
            
            # Check if any new sequences are invalid
            for sequence, seq_row, seq_col, seq_direction in new_sequences:
                # Only validate sequences of 3+ letters that are not already placed words
                if len(sequence) >= 3:
                    # Check if this sequence corresponds to an already placed word
                    is_placed_word = False
                    for existing_word in self.words:
                        if (existing_word.text == sequence and 
                            existing_word.row == seq_row and 
                            existing_word.col == seq_col and 
                            existing_word.direction == seq_direction):
                            is_placed_word = True
                            break
                    
                    if not is_placed_word and sequence not in available_answers:
                        return False

        return True

    def _get_new_sequences_from_placement(
        self, word: str, row: int, col: int, direction: Direction
    ) -> List[Tuple[str, int, int, Direction]]:
        """Get new letter sequences that would be created by placing a word.
        
        This is an optimized version that directly analyzes the grid without
        creating temporary objects, avoiding the expensive temporary grid creation.
        """
        new_sequences = []
        
        if direction == Direction.ACROSS:
            # Check for new vertical sequences that would be created
            for i, char in enumerate(word):
                word_col = col + i
                word_row = row
                
                # Find the start of any vertical sequence at this position
                start_row = word_row
                while (start_row > 0 and 
                       self.grid[start_row - 1][word_col] != "."):
                    start_row -= 1
                
                # Find the end of any vertical sequence at this position
                end_row = word_row
                while (end_row < self.height - 1 and 
                       self.grid[end_row + 1][word_col] != "."):
                    end_row += 1
                
                # If we have a sequence of 2+ characters, check if it's new
                if end_row - start_row + 1 >= 2:
                    # Build the sequence
                    sequence = ""
                    for r in range(start_row, end_row + 1):
                        if r == word_row:
                            sequence += char  # Use the new character
                        else:
                            sequence += self.grid[r][word_col]
                    
                    # Only add if it's a new sequence (not already a placed word)
                    is_existing_word = False
                    for existing_word in self.words:
                        if (existing_word.direction == Direction.DOWN and
                            existing_word.row == start_row and
                            existing_word.col == word_col and
                            existing_word.text == sequence):
                            is_existing_word = True
                            break
                    
                    if not is_existing_word:
                        new_sequences.append((sequence, start_row, word_col, Direction.DOWN))
        
        else:  # DOWN
            # Check for new horizontal sequences that would be created
            for i, char in enumerate(word):
                word_row = row + i
                word_col = col
                
                # Find the start of any horizontal sequence at this position
                start_col = word_col
                while (start_col > 0 and 
                       self.grid[word_row][start_col - 1] != "."):
                    start_col -= 1
                
                # Find the end of any horizontal sequence at this position
                end_col = word_col
                while (end_col < self.width - 1 and 
                       self.grid[word_row][end_col + 1] != "."):
                    end_col += 1
                
                # If we have a sequence of 2+ characters, check if it's new
                if end_col - start_col + 1 >= 2:
                    # Build the sequence
                    sequence = ""
                    for c in range(start_col, end_col + 1):
                        if c == word_col:
                            sequence += char  # Use the new character
                        else:
                            sequence += self.grid[word_row][c]
                    
                    # Only add if it's a new sequence (not already a placed word)
                    is_existing_word = False
                    for existing_word in self.words:
                        if (existing_word.direction == Direction.ACROSS and
                            existing_word.row == word_row and
                            existing_word.col == start_col and
                            existing_word.text == sequence):
                            is_existing_word = True
                            break
                    
                    if not is_existing_word:
                        new_sequences.append((sequence, word_row, start_col, Direction.ACROSS))
        
        return new_sequences

    def place_word(
        self,
        word: str,
        row: int,
        col: int,
        direction: Direction,
        clue: str,
        quality: int = 2,
    ):
        """Place a word on the grid."""
        if direction == Direction.ACROSS:
            for i, char in enumerate(word):
                self.grid[row][col + i] = char
        else:  # DOWN
            for i, char in enumerate(word):
                self.grid[row + i][col] = char

        self.words.append(Word(word, row, col, direction, clue, quality))
        # Invalidate cache when grid changes
        self._invalidate_cache()

    def count_empty_squares(self) -> int:
        """Count the number of empty squares in the grid."""
        if self._cached_empty_squares is not None:
            return self._cached_empty_squares
        
        count = 0
        for row in self.grid:
            for cell in row:
                if cell == ".":
                    count += 1
        self._cached_empty_squares = count
        return count

    def has_excessive_consecutive_empty_squares(self) -> bool:
        """Check if any row or column has (dimension // 2) or more consecutive empty squares.

        Returns:
            True if any row or column has too many consecutive empty squares, False otherwise.
        """
        return self.count_consecutive_empty_violations() > 0

    def count_consecutive_empty_violations(self) -> int:
        """Count the number of consecutive empty square violations.

        A violation occurs when a row or column has (dimension // 2) or more consecutive empty squares.

        Returns:
            Number of violations found in the grid.
        """
        max_consecutive = max(self.width, self.height) // 2
        violations = 0

        # Check rows for consecutive empty squares
        for row in self.grid:
            consecutive_empty = 0
            for cell in row:
                if cell == ".":
                    consecutive_empty += 1
                    if consecutive_empty > max_consecutive:
                        violations += 1
                else:
                    consecutive_empty = 0

        # Check columns for consecutive empty squares
        for col in range(self.width):
            consecutive_empty = 0
            for row in range(self.height):
                if self.grid[row][col] == ".":
                    consecutive_empty += 1
                    if consecutive_empty > max_consecutive:
                        violations += 1
                else:
                    consecutive_empty = 0

        return violations

    def get_used_answers(self) -> Set[str]:
        """Get set of all answers used in this crossword."""
        if self._cached_used_answers is not None:
            return self._cached_used_answers
        
        self._cached_used_answers = {word.text for word in self.words}
        return self._cached_used_answers

    def get_all_letter_sequences(self) -> List[Tuple[str, int, int, Direction]]:
        """Get all contiguous letter sequences in the grid (potential words)."""
        if self._cached_sequences is not None:
            return self._cached_sequences
        
        sequences = []

        # Check horizontal sequences (across)
        for row in range(self.height):
            col = 0
            while col < self.width:
                if self.grid[row][col] != ".":
                    # Found start of a sequence
                    start_col = col
                    sequence = ""
                    while col < self.width and self.grid[row][col] != ".":
                        sequence += self.grid[row][col]
                        col += 1
                    if len(sequence) > 1:  # Only sequences of length 2 or more matter
                        sequences.append((sequence, row, start_col, Direction.ACROSS))
                else:
                    col += 1

        # Check vertical sequences (down)
        for col in range(self.width):
            row = 0
            while row < self.height:
                if self.grid[row][col] != ".":
                    # Found start of a sequence
                    start_row = row
                    sequence = ""
                    while row < self.height and self.grid[row][col] != ".":
                        sequence += self.grid[row][col]
                        row += 1
                    if len(sequence) > 1:  # Only sequences of length 2 or more matter
                        sequences.append((sequence, start_row, col, Direction.DOWN))
                else:
                    row += 1

        self._cached_sequences = sequences
        return sequences

    def get_placed_words_set(self) -> Set[Tuple[str, int, int, Direction]]:
        """Get set of all placed words as (text, row, col, direction) tuples."""
        if self._cached_placed_words is not None:
            return self._cached_placed_words
        
        self._cached_placed_words = {(word.text, word.row, word.col, word.direction) for word in self.words}
        return self._cached_placed_words

    def count_invalid_sequences(self, available_answers: Set[str]) -> int:
        """Count number of invalid letter sequences in the grid."""
        # Use a cache key that includes available_answers to avoid conflicts
        cache_key = id(available_answers)  # Use object id as cache key
        if hasattr(self, '_cached_invalid_sequences') and hasattr(self, '_cached_invalid_answers_id'):
            if self._cached_invalid_answers_id == cache_key:
                return self._cached_invalid_sequences
        
        all_sequences = self.get_all_letter_sequences()
        placed_words = self.get_placed_words_set()
        invalid_sequences = 0

        for sequence, row, col, direction in all_sequences:
            # Check if this sequence corresponds to a placed word
            if (sequence, row, col, direction) not in placed_words:
                # This is an unintended word - check if it's valid
                # Only validate sequences of 2+ letters
                if len(sequence) >= 2 and sequence not in available_answers:
                    invalid_sequences += 1

        self._cached_invalid_sequences = invalid_sequences
        self._cached_invalid_answers_id = cache_key
        return invalid_sequences

    def process_unintended_sequences(
        self,
        available_answers: Set[str],
        clue_lookup: dict,
        clue_list: List[Tuple[str, str, int]] = None,
    ) -> List[Word]:
        """Process unintended sequences and return updated word list with valid sequences added and overlapping clues removed."""
        all_sequences = self.get_all_letter_sequences()
        placed_words = self.get_placed_words_set()
        unintended_sequences = []

        # Find all unintended sequences that are valid words
        for sequence, row, col, direction in all_sequences:
            if (sequence, row, col, direction) not in placed_words:
                if len(sequence) >= 3 and sequence in available_answers:
                    # Find a clue and quality for this sequence
                    clue = clue_lookup.get(sequence, f"Unknown word: {sequence}")
                    # Look up the actual quality from the clue list
                    quality = 2  # Default fallback
                    if clue_list:
                        for clue_text, answer, q in clue_list:
                            if answer == sequence:
                                quality = q
                                break
                    unintended_sequences.append(
                        Word(sequence, row, col, direction, clue, quality)
                    )

        # Create a new word list starting with existing words
        updated_words = self.words[:]

        # Add valid unintended sequences as new words
        for seq_word in unintended_sequences:
            updated_words.append(seq_word)

        # Remove words that are substrings of longer valid sequences
        words_to_remove = []
        for word in updated_words:
            for other_word in updated_words:
                if (
                    word != other_word
                    and word.text in other_word.text
                    and len(word.text) < len(other_word.text)
                    and
                    # Check if they overlap in the grid
                    self._words_overlap(word, other_word)
                ):
                    words_to_remove.append(word)
                    break

        # Remove the overlapping words
        final_words = [w for w in updated_words if w not in words_to_remove]

        return final_words

    def get_final_word_count(
        self,
        available_answers: Set[str] = None,
        clue_lookup: dict = None,
        clue_list: List[Tuple[str, str, int]] = None,
    ) -> int:
        """Get the total word count including unintended sequences that become valid words."""
        if available_answers is not None and clue_lookup is not None:
            final_words = self.process_unintended_sequences(
                available_answers, clue_lookup, clue_list
            )
            return len(final_words)
        else:
            return len(self.words)

    def get_final_words(
        self,
        available_answers: Set[str] = None,
        clue_lookup: dict = None,
        clue_list: List[Tuple[str, str, int]] = None,
    ) -> List[Word]:
        """Get the final word list including unintended sequences that become valid words."""
        if available_answers is not None and clue_lookup is not None:
            return self.process_unintended_sequences(
                available_answers, clue_lookup, clue_list
            )
        else:
            return self.words

    def _words_overlap(self, word1: Word, word2: Word) -> bool:
        """Check if two words overlap in the grid."""
        if word1.direction == word2.direction:
            return False  # Same direction words don't overlap

        if word1.direction == Direction.ACROSS:
            # word1 is across, word2 is down
            return (
                word1.row == word2.row
                and word2.col >= word1.col
                and word2.col < word1.col + len(word1.text)
            )
        else:
            # word1 is down, word2 is across
            return (
                word1.col == word2.col
                and word2.row >= word1.row
                and word2.row < word1.row + len(word1.text)
            )

    def display(
        self,
        available_answers: Set[str] = None,
        clue_lookup: dict = None,
        clue_list: List[Tuple[str, str, int]] = None,
    ):
        """Display the crossword grid."""
        print("\nCrossword Grid:")
        for row in self.grid:
            print(" ".join(cell if cell != "." else "█" for cell in row))

        # Process unintended sequences if we have the necessary data
        if available_answers is not None and clue_lookup is not None:
            final_words = self.process_unintended_sequences(
                available_answers, clue_lookup, clue_list
            )
        else:
            final_words = self.words

        print("\nClues:")
        across_words = [w for w in final_words if w.direction == Direction.ACROSS]
        down_words = [w for w in final_words if w.direction == Direction.DOWN]

        print("Across:")
        for word in sorted(across_words, key=lambda w: (w.row, w.col)):
            print(f"  {word.text}: {word.clue} (quality: {word.quality})")

        print("Down:")
        for word in sorted(down_words, key=lambda w: (w.col, w.row)):
            print(f"  {word.text}: {word.clue} (quality: {word.quality})")

        # Show all letter sequences for debugging
        if available_answers is not None:
            all_sequences = self.get_all_letter_sequences()
            placed_words = self.get_placed_words_set()
            unintended_sequences = []

            for sequence, row, col, direction in all_sequences:
                if (sequence, row, col, direction) not in placed_words:
                    # Only show sequences of 3+ letters
                    if len(sequence) >= 3:
                        valid = sequence in available_answers
                        unintended_sequences.append(
                            (sequence, row, col, direction, valid)
                        )

            if unintended_sequences:
                print("\nUnintended letter sequences:")
                for sequence, row, col, direction, valid in unintended_sequences:
                    status = "✓" if valid else "✗"
                    dir_str = "across" if direction == Direction.ACROSS else "down"
                    print(f"  {status} {sequence} at ({row},{col}) {dir_str}")
            else:
                print("\nNo unintended letter sequences found.")


class CrosswordGenerator:
    def __init__(self, clue_list_file: str, width: int = 5, height: int = 5):
        """Initialize the crossword generator with a clue list and grid dimensions."""
        self.width = width
        self.height = height

        with open(clue_list_file, "r", encoding="utf-8") as file:
            self.clue_list = json.load(file)

        # Handle both 2-tuple (old format) and 3-tuple (new format with quality) clues
        if self.clue_list and len(self.clue_list[0]) == 2:
            # Old format: convert to new format with default quality 2
            self.clue_list = [(clue, answer, 2) for clue, answer in self.clue_list]

        # Calculate maximum word length that can fit in the grid
        max_word_length = max(self.width, self.height)

        # Create set of all available answers for validation
        # Only include words that can fit in the grid (length <= max(width, height))
        self.available_answers = set(
            answer
            for clue, answer, quality in self.clue_list
            if len(answer) <= max_word_length
        )

        # Create clue lookup dictionary for unintended sequences
        # Only include words that can fit in the grid
        self.clue_lookup = {
            answer: clue
            for clue, answer, quality in self.clue_list
            if len(answer) <= max_word_length
        }

        # Group answers by length for efficient lookup
        # Only include words that can fit in the grid (length <= max(width, height))
        self.answers_by_length = {}
        for clue, answer, quality in self.clue_list:
            length = len(answer)
            if length <= max_word_length:  # Only include words that can fit
                if length not in self.answers_by_length:
                    self.answers_by_length[length] = []
                self.answers_by_length[length].append((answer, clue, quality))

        print(f"Loaded {len(self.clue_list)} clue/answer pairs")

        # Show quality distribution
        quality_counts = {}
        for clue, answer, quality in self.clue_list:
            quality_counts[quality] = quality_counts.get(quality, 0) + 1

        print("Quality distribution:")
        for quality in sorted(quality_counts.keys()):
            percentage = (quality_counts[quality] / len(self.clue_list)) * 100
            print(
                f"  Quality {quality}: {quality_counts[quality]} clues ({percentage:.1f}%)"
            )

        # Show quality distribution by word length
        print("\nQuality distribution by word length:")
        for length in sorted(self.answers_by_length.keys()):
            stats = self.get_quality_stats(length)
            print(f"  {length} letters: {stats['total_words']} words")
            for quality in sorted(stats["quality_counts"].keys()):
                count = stats["quality_counts"][quality]
                percentage = stats["quality_percentages"][quality]
                print(f"    Quality {quality}: {count} ({percentage:.1f}%)")

    def get_possible_words(
        self,
        length: int,
        pattern: str = None,
        used_answers: Set[str] = None,
        max_results: int = 50,
        prioritize_quality: bool = True,
    ) -> List[Tuple[str, str, int]]:
        """Get possible words of given length that match pattern and aren't used.

        Args:
            length: Word length to search for
            pattern: Pattern to match (e.g., "A..E" for words starting with A and ending with E)
            used_answers: Set of already used answers to exclude
            max_results: Maximum number of results to return
            prioritize_quality: If True, prioritize quality 1 clues first (since master list is sorted by quality)
        """
        if length not in self.answers_by_length:
            return []

        if used_answers is None:
            used_answers = set()

        possible = []
        checked = 0
        max_to_check = min(1000, len(self.answers_by_length[length]))

        # If prioritizing quality, we can be more efficient since the list is sorted
        if prioritize_quality:
            # First pass: collect quality 1 clues (they're at the beginning of the sorted list)
            quality_1_results = []
            quality_2_results = []

            for answer, clue, quality in self.answers_by_length[length]:
                checked += 1
                if checked > max_to_check:
                    break

                if answer in used_answers:
                    continue

                # Check pattern match - optimized with early exit
                if pattern is not None:
                    if len(answer) != len(pattern):
                        continue
                    # Use all() with generator for early exit
                    if not all(p == "." or p == a for p, a in zip(pattern, answer)):
                        continue

                # Add to appropriate quality bucket
                if quality == 1:
                    quality_1_results.append((answer, clue, quality))
                else:
                    quality_2_results.append((answer, clue, quality))

                # If we have enough quality 1 results, we can stop early
                if len(quality_1_results) >= max_results:
                    break

            # Return quality 1 results first, then quality 2 if needed
            possible = quality_1_results
            if len(possible) < max_results:
                possible.extend(quality_2_results[: max_results - len(possible)])
        else:
            # Original logic for non-quality-prioritized search
            for answer, clue, quality in self.answers_by_length[length]:
                checked += 1
                if checked > max_to_check:
                    break

                if answer in used_answers:
                    continue

                if pattern is None:
                    possible.append((answer, clue, quality))
                else:
                    # Check if answer matches pattern (. means any character) - optimized
                    if len(answer) == len(pattern) and all(p == "." or p == a for p, a in zip(pattern, answer)):
                        possible.append((answer, clue, quality))

                # Limit results to prevent excessive processing
                if len(possible) >= max_results:
                    break

        return possible

    def get_best_quality_words(
        self,
        length: int,
        pattern: str = None,
        used_answers: Set[str] = None,
        max_results: int = 10,
        target_quality: int = 1,
    ) -> List[Tuple[str, str, int]]:
        """Get the best quality words of given length, optimized for quality-sorted data.

        This method is more efficient than get_possible_words when you specifically
        want the highest quality clues, since it can stop early once it finds enough
        quality 1 clues.

        Args:
            length: Word length to search for
            pattern: Pattern to match (e.g., "A..E" for words starting with A and ending with E)
            used_answers: Set of already used answers to exclude
            max_results: Maximum number of results to return
            target_quality: Target quality level (1 is highest, 2 is lower)
        """
        if length not in self.answers_by_length:
            return []

        if used_answers is None:
            used_answers = set()

        results = []
        checked = 0
        max_to_check = min(
            500, len(self.answers_by_length[length])
        )  # Reduced limit for efficiency

        for answer, clue, quality in self.answers_by_length[length]:
            checked += 1
            if checked > max_to_check:
                break

            # Skip if quality is worse than target
            if quality > target_quality:
                continue

            if answer in used_answers:
                continue

            # Check pattern match - optimized with early exit
            if pattern is not None:
                if len(answer) != len(pattern) or not all(p == "." or p == a for p, a in zip(pattern, answer)):
                    continue

            results.append((answer, clue, quality))

            # Early termination: if we found enough target quality results, stop
            if len(results) >= max_results:
                break

        return results

    def get_quality_stats(self, length: int = None) -> dict:
        """Get quality statistics for words of a given length or all lengths.

        Args:
            length: Specific word length to analyze, or None for all lengths

        Returns:
            Dictionary with quality distribution statistics
        """
        if length is not None:
            if length not in self.answers_by_length:
                return {}
            words_to_analyze = self.answers_by_length[length]
        else:
            words_to_analyze = [
                (answer, clue, quality) for answer, clue, quality in self.clue_list
            ]

        quality_counts = {}
        total_words = len(words_to_analyze)

        for answer, clue, quality in words_to_analyze:
            quality_counts[quality] = quality_counts.get(quality, 0) + 1

        # Calculate percentages
        quality_percentages = {}
        for quality, count in quality_counts.items():
            quality_percentages[quality] = (count / total_words) * 100

        return {
            "total_words": total_words,
            "quality_counts": quality_counts,
            "quality_percentages": quality_percentages,
            "length": length,
        }

    def find_intersecting_words(
        self, grid: CrosswordGrid, word: str, row: int, col: int, direction: Direction
    ) -> List[Tuple[str, str, int, int, int, Direction]]:
        """Find words that could intersect with the given word placement."""
        intersecting = []
        used_answers = grid.get_used_answers()
        max_intersections = 20  # Limit total intersections to prevent slowdown

        if direction == Direction.ACROSS:
            # Look for vertical words that could intersect
            for i, char in enumerate(word):
                if len(intersecting) >= max_intersections:
                    break

                word_col = col + i
                # Check above and below - limit range for performance
                for start_row in range(max(0, row - 2), min(row + 1, grid.height - 2)):
                    if len(intersecting) >= max_intersections:
                        break

                    end_row = min(start_row + 4, grid.height - 1)
                    length = end_row - start_row + 1
                    if length < 3 or length > min(
                        grid.width, grid.height
                    ):  # Reasonable word length for grid
                        continue

                    # Create pattern with the intersecting character
                    pattern = ["."] * length
                    intersect_pos = row - start_row
                    if 0 <= intersect_pos < length:
                        pattern[intersect_pos] = char
                        pattern_str = "".join(pattern)

                        possible_words = self.get_best_quality_words(
                            length,
                            pattern_str,
                            used_answers,
                            max_results=10,
                            target_quality=1,
                        )
                        for answer, clue, quality in possible_words:
                            if len(intersecting) >= max_intersections:
                                break
                            # OPTIMIZATION: Do basic validation first before expensive validation
                            if (start_row + len(answer) <= grid.height and
                                (start_row == 0 or grid.grid[start_row - 1][word_col] == ".") and
                                (start_row + len(answer) >= grid.height or grid.grid[start_row + len(answer)][word_col] == ".")):
                                if grid.is_valid_placement(
                                    answer,
                                    start_row,
                                    word_col,
                                    Direction.DOWN,
                                    self.available_answers,
                                ):
                                    intersecting.append(
                                        (
                                            answer,
                                            clue,
                                            quality,
                                            start_row,
                                            word_col,
                                            Direction.DOWN,
                                        )
                                    )

        else:  # DOWN
            # Look for horizontal words that could intersect
            for i, char in enumerate(word):
                if len(intersecting) >= max_intersections:
                    break

                word_row = row + i
                # Check left and right - limit range for performance
                for start_col in range(max(0, col - 2), min(col + 1, grid.width - 2)):
                    if len(intersecting) >= max_intersections:
                        break

                    end_col = min(start_col + 4, grid.width - 1)
                    length = end_col - start_col + 1
                    if length < 3 or length > min(
                        grid.width, grid.height
                    ):  # Reasonable word length for grid
                        continue

                    # Create pattern with the intersecting character
                    pattern = ["."] * length
                    intersect_pos = col - start_col
                    if 0 <= intersect_pos < length:
                        pattern[intersect_pos] = char
                        pattern_str = "".join(pattern)

                        possible_words = self.get_best_quality_words(
                            length,
                            pattern_str,
                            used_answers,
                            max_results=10,
                            target_quality=1,
                        )
                        for answer, clue, quality in possible_words:
                            if len(intersecting) >= max_intersections:
                                break
                            # OPTIMIZATION: Do basic validation first before expensive validation
                            if (start_col + len(answer) <= grid.width and
                                (start_col == 0 or grid.grid[word_row][start_col - 1] == ".") and
                                (start_col + len(answer) >= grid.width or grid.grid[word_row][start_col + len(answer)] == ".")):
                                if grid.is_valid_placement(
                                    answer,
                                    word_row,
                                    start_col,
                                    Direction.ACROSS,
                                    self.available_answers,
                                ):
                                    intersecting.append(
                                        (
                                            answer,
                                            clue,
                                            quality,
                                            word_row,
                                            start_col,
                                            Direction.ACROSS,
                                        )
                                    )

        return intersecting

    def _score_puzzle_quality(self, grid: CrosswordGrid) -> int:
        """Score puzzle quality - lower is better. Returns empty squares + invalid sequences."""
        empty_squares = grid.count_empty_squares()
        invalid_sequences = grid.count_invalid_sequences(self.available_answers)
        return empty_squares + invalid_sequences

    def _score_constraint_violating_puzzle(self, grid: CrosswordGrid) -> float:
        """Score constraint-violating puzzles - lower is better.

        This method calculates a score for puzzles that violate constraints.
        The score is based on:
        - Number of words (more is better, so lower penalty)
        - Average quality of clues (higher is better, so lower penalty)
        - Fewer empty squares (more is better, so lower penalty)
        - Fewer invalid sequences (more is better, so lower penalty)
        - Fewer consecutive empty square violations (more is better, so lower penalty)

        Returns a float score where lower is better.
        """
        # Get final word count including unintended sequences
        final_word_count = grid.get_final_word_count(
            self.available_answers, self.clue_lookup, self.clue_list
        )

        # Calculate average quality
        avg_quality = self.calculate_average_quality(
            grid, self.available_answers, self.clue_lookup
        )

        # Count empty squares, invalid sequences, and consecutive violations
        empty_squares = grid.count_empty_squares()
        invalid_sequences = grid.count_invalid_sequences(self.available_answers)
        consecutive_violations = grid.count_consecutive_empty_violations()

        # Calculate penalty components (lower is better)
        # Penalty for having fewer words (inverse of word count)
        word_penalty = max(
            0, 20 - final_word_count
        )  # Penalty decreases as word count increases

        # Penalty for lower quality (inverse of quality)
        quality_penalty = max(
            0, 50 - avg_quality * 50
        )  # Penalty decreases as quality increases

        # Penalty for more empty squares
        density_penalty = empty_squares * 2  # Penalty increases with empty squares

        # Penalty for invalid sequences
        validity_penalty = (
            invalid_sequences * 5
        )  # Penalty increases with invalid sequences

        # Penalty for consecutive empty square violations
        consecutive_penalty = (
            consecutive_violations * 10
        )  # Penalty increases with violations

        total_penalty = (
            word_penalty
            + quality_penalty
            + density_penalty
            + validity_penalty
            + consecutive_penalty
        )
        return total_penalty

    def calculate_average_quality(
        self,
        grid: CrosswordGrid,
        available_answers: Set[str] = None,
        clue_lookup: dict = None,
    ) -> float:
        """Calculate the average quality score for all clues in the crossword.

        Args:
            grid: The crossword grid
            available_answers: Set of available answers (for processing unintended sequences)
            clue_lookup: Clue lookup dictionary (for processing unintended sequences)
        """
        # Use final words if available_answers and clue_lookup are provided
        if available_answers is not None and clue_lookup is not None:
            final_words = grid.get_final_words(
                available_answers, clue_lookup, self.clue_list
            )
        else:
            final_words = grid.words

        if not final_words:
            return 0.0

        # Optimized: use sum() with generator expression for better performance
        total_quality = sum(word.quality for word in final_words)
        return total_quality / len(final_words)

    def generate_single_crossword_attempt(
        self, verbose_iteration_1: bool, verbose_iteration_2: bool
    ) -> Tuple[CrosswordGrid, bool, float]:
        """Generate a single crossword attempt.

        Args:
            verbose_iteration_1: Whether to show basic progress output
            verbose_iteration_2: Whether to show detailed progress output

        Returns:
            Tuple of (grid, is_valid, quality_score)
        """
        grid = CrosswordGrid(self.width, self.height)

        # Start with a random word in the center - prioritize quality 1 words
        # Try different word lengths based on grid size
        max_word_length = min(self.width, self.height)
        center_words = []
        for length in range(max_word_length - 1, max_word_length + 1):
            center_words.extend(
                self.get_best_quality_words(length, target_quality=1, max_results=20)
            )

        if not center_words:
            if verbose_iteration_1:
                tqdm.write("  ✗ No center words available")
            return None, False, 0.0

        start_word, start_clue, start_quality = random.choice(center_words)
        start_direction = random.choice([Direction.ACROSS, Direction.DOWN])

        if start_direction == Direction.ACROSS:
            start_row = self.height // 2
            start_col = max(0, (self.width - len(start_word)) // 2)
        else:
            start_row = max(0, (self.height - len(start_word)) // 2)
            start_col = self.width // 2

        if not grid.is_valid_placement(
            start_word, start_row, start_col, start_direction, self.available_answers
        ):
            if verbose_iteration_1:
                tqdm.write(
                    f"  ✗ Cannot place start word '{start_word}' at ({start_row},{start_col}) {start_direction.value}"
                )
            return None, False, 0.0

        grid.place_word(
            start_word, start_row, start_col, start_direction, start_clue, start_quality
        )
        if verbose_iteration_2:
            tqdm.write(
                f"  ✓ Placed start word '{start_word}' at ({start_row},{start_col}) {start_direction.value}"
            )

        # Try to add more words
        words_added = 1

        for iteration in range(50):  # Reduced max iterations for better performance
            # Find intersecting words for existing words
            found_word = False
            total_candidates = 0

            for existing_word in grid.words[
                :
            ]:  # Use slice to avoid modification during iteration
                intersecting_words = self.find_intersecting_words(
                    grid,
                    existing_word.text,
                    existing_word.row,
                    existing_word.col,
                    existing_word.direction,
                )
                total_candidates += len(intersecting_words)

                if intersecting_words:
                    # Shuffle and try a few
                    random.shuffle(intersecting_words)
                    for word, clue, quality, row, col, direction in intersecting_words[
                        :5
                    ]:  # Try up to 5
                        if grid.is_valid_placement(
                            word, row, col, direction, self.available_answers
                        ):
                            grid.place_word(word, row, col, direction, clue, quality)
                            words_added += 1
                            if verbose_iteration_2:
                                tqdm.write(
                                    f"  ✓ Added word #{words_added}: '{word}' at ({row},{col}) {direction.value}"
                                )
                            found_word = True
                            break
                    if found_word:
                        break

            if not found_word:
                if verbose_iteration_2:
                    tqdm.write(
                        f"  → Stopped after {iteration + 1} iterations, {total_candidates} candidates tried"
                    )
                break

        # Check if this is a valid crossword
        empty_squares = grid.count_empty_squares()
        used_answers = grid.get_used_answers()
        invalid_sequences = grid.count_invalid_sequences(self.available_answers)

        if verbose_iteration_1:
            # Calculate final word count including unintended sequences
            final_word_count = grid.get_final_word_count(
                self.available_answers, self.clue_lookup, self.clue_list
            )
            tqdm.write(
                f"  → Final stats: {len(grid.words)} placed words, {final_word_count} total words (including unintended sequences), {empty_squares} empty squares"
            )
            tqdm.write(
                f"  → Validation: all_sequences_valid={invalid_sequences == 0}, no_repeats={len(used_answers) == len(grid.words)}"
            )

        # Check if this is a valid crossword
        # Calculate max empty squares based on grid size (roughly 25% of total squares)
        max_empty_squares = int((self.width * self.height) * 0.25)
        min_words = max(
            6, int((self.width + self.height) * 0.5)
        )  # Minimum words based on grid size

        is_valid = (
            empty_squares <= max_empty_squares
            and len(used_answers) == len(grid.words)  # No repeated answers
            and len(grid.words) >= min_words  # Minimum number of words
            and invalid_sequences == 0
            and not grid.has_excessive_consecutive_empty_squares()  # No excessive consecutive empty squares
        )  # All letter sequences are valid words

        if is_valid:
            # Calculate quality score
            quality_score = self.calculate_average_quality(
                grid, self.available_answers, self.clue_lookup
            )
            return grid, True, quality_score
        else:
            # Show why this attempt failed if verbose
            if verbose_iteration_1:
                reasons = []
                if empty_squares > max_empty_squares:
                    reasons.append(
                        f"too many empty squares ({empty_squares}/{max_empty_squares})"
                    )
                if len(used_answers) != len(grid.words):
                    reasons.append(
                        f"repeated answers ({len(grid.words) - len(used_answers)} duplicates)"
                    )
                if len(grid.words) < min_words:
                    reasons.append(f"too few words ({len(grid.words)}/{min_words})")
                if invalid_sequences > 0:
                    reasons.append(f"invalid letter sequences ({invalid_sequences})")
                if grid.has_excessive_consecutive_empty_squares():
                    reasons.append("excessive consecutive empty squares")
                tqdm.write(f"  ✗ Failed: {', '.join(reasons)}")
            return grid, False, 0.0

    def generate_crosswords_batch(
        self, count: int, max_iterations: int, verbose_level: int = 1
    ) -> List[CrosswordGrid]:
        """Generate multiple crosswords with a total iteration limit.

        Args:
            count: Number of crosswords to return
            max_iterations: Maximum total iterations to run
            verbose_level: Verbosity level for output

        Returns:
            List of crosswords, with perfect puzzles first, then imperfect puzzles,
            then highest-scoring constraint-violating puzzles
        """
        perfect_crosswords = []
        imperfect_crosswords = []
        constraint_violating_crosswords = []  # List of (grid, score) tuples

        print(
            f"Generating {count} crosswords with max {max_iterations} total iterations..."
        )

        # Single iteration counter running to max_iterations
        last_perfect_attempts = 0

        # Create progress bar with dynamic description
        progress_bar = tqdm(range(max_iterations), desc="Generating crosswords...")

        def update_progress_description():
            """Update the progress bar description with current counts."""
            desc = f"🟢: {len(perfect_crosswords)}, 🟡: {len(imperfect_crosswords)}, 🔴: {len(constraint_violating_crosswords)}"
            progress_bar.set_description(desc)

        for attempt in progress_bar:
            verbose_iteration_1 = verbose_level >= 1 and attempt < 1000
            verbose_iteration_2 = verbose_level >= 2 and attempt < 1000

            if verbose_iteration_1 and (attempt % 100 == 0 or attempt < 1000):
                tqdm.write(f"\nAttempt {attempt + 1}:")
                tqdm.write(f"  Perfect puzzles found: {len(perfect_crosswords)}")
                tqdm.write(f"  Imperfect puzzles found: {len(imperfect_crosswords)}")
                tqdm.write(
                    f"  Constraint-violating puzzles found: {len(constraint_violating_crosswords)}"
                )

            # Generate a single crossword attempt
            grid, is_valid, quality_score = self.generate_single_crossword_attempt(
                verbose_iteration_1, verbose_iteration_2
            )

            if grid is None:  # No center words available
                continue

            if is_valid:
                # Create a copy of the grid - optimized shallow copy for immutable data
                grid_copy = CrosswordGrid(
                    grid.width,
                    grid.height,
                    [row[:] for row in grid.grid],  # Shallow copy is sufficient for strings
                    grid.words[:],  # Shallow copy is sufficient for Word objects
                )

                if quality_score == 1.0:
                    # Perfect puzzle
                    perfect_crosswords.append(grid_copy)
                    update_progress_description()
                    tqdm.write(
                        f"🎯 Found perfect crossword #{len(perfect_crosswords)} in {attempt + 1 - last_perfect_attempts} attempts! (Quality: {quality_score:.2f})"
                    )
                    last_perfect_attempts = attempt + 1
                else:
                    # Imperfect but valid puzzle
                    imperfect_crosswords.append(grid_copy)

                    # Only keep (count - perfect) imperfect puzzles since perfect are prioritized first
                    if len(imperfect_crosswords) > count - len(perfect_crosswords):
                        imperfect_crosswords = imperfect_crosswords[
                            : count - len(perfect_crosswords)
                        ]

                    update_progress_description()
                    if verbose_iteration_1:
                        tqdm.write(
                            f"✓ Found imperfect crossword #{len(imperfect_crosswords)} in {attempt + 1} attempts! (Quality: {quality_score:.2f})"
                        )

                # Check if we have enough perfect puzzles
                if len(perfect_crosswords) >= count:
                    tqdm.write(
                        f"🎯 Found {len(perfect_crosswords)} perfect puzzles! Stopping early."
                    )
                    break
            else:
                # Constraint-violating puzzle - calculate score and track it
                constraint_score = self._score_constraint_violating_puzzle(grid)

                # Create a copy of the grid - optimized shallow copy for immutable data
                grid_copy = CrosswordGrid(
                    grid.width,
                    grid.height,
                    [row[:] for row in grid.grid],  # Shallow copy is sufficient for strings
                    grid.words[:],  # Shallow copy is sufficient for Word objects
                )

                # Add to constraint-violating list
                constraint_violating_crosswords.append((grid_copy, constraint_score))

                # Keep only the best constraint-violating puzzles to avoid memory issues
                # Sort by score (ascending) and keep only (count - perfect - imperfect) since perfect and imperfect are prioritized first
                constraint_violating_crosswords.sort(key=lambda x: x[1], reverse=False)
                max_invalid_needed = (
                    count - len(perfect_crosswords) - len(imperfect_crosswords)
                )
                if len(constraint_violating_crosswords) > max_invalid_needed:
                    constraint_violating_crosswords = constraint_violating_crosswords[
                        :max_invalid_needed
                    ]

                update_progress_description()
                if verbose_iteration_1:
                    tqdm.write(
                        f"⚠ Found constraint-violating crossword #{len(constraint_violating_crosswords)} in {attempt + 1} attempts! (Penalty: {constraint_score:.1f})"
                    )

        # Close the progress bar
        progress_bar.close()

        # Prepare final results
        result = []

        # Add perfect puzzles first (up to count)
        perfect_to_add = min(len(perfect_crosswords), count)
        result.extend(perfect_crosswords[:perfect_to_add])

        # Add imperfect puzzles to fill remaining slots
        remaining_slots = count - perfect_to_add
        imperfect_to_add = 0
        if remaining_slots > 0:
            imperfect_to_add = min(len(imperfect_crosswords), remaining_slots)
            result.extend(imperfect_crosswords[:imperfect_to_add])
            remaining_slots -= imperfect_to_add

        # Add constraint-violating puzzles to fill remaining slots
        constraint_violating_to_add = 0
        if remaining_slots > 0 and constraint_violating_crosswords:
            constraint_violating_to_add = min(
                len(constraint_violating_crosswords), remaining_slots
            )
            # Extract just the grids (not the scores) from the tuples
            constraint_violating_grids = [
                grid
                for grid, score in constraint_violating_crosswords[
                    :constraint_violating_to_add
                ]
            ]
            result.extend(constraint_violating_grids)

        # Print summary
        print(f"\n{'=' * 60}")
        print("BATCH GENERATION SUMMARY")
        print(f"{'=' * 60}")
        print(f"Total iterations: {max_iterations}")
        print(f"Perfect puzzles found: {len(perfect_crosswords)}")
        print(f"Imperfect puzzles found: {len(imperfect_crosswords)}")
        print(
            f"Constraint-violating puzzles found: {len(constraint_violating_crosswords)}"
        )
        print(f"Puzzles returned: {len(result)}")
        print(f"Perfect puzzles in result: {perfect_to_add}")
        print(f"Imperfect puzzles in result: {imperfect_to_add}")
        print(f"Constraint-violating puzzles in result: {constraint_violating_to_add}")

        return result


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate crosswords using extracted clue/answer pairs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Note: The generator uses batch mode and will:
  - Run up to max-iterations total attempts
  - Collect both perfect and imperfect valid puzzles
  - Return perfect puzzles first, then imperfect puzzles
  - Stop early if enough perfect puzzles are found

Examples:
  python crossword_generator.py
  python crossword_generator.py --count 5
  python crossword_generator.py --count 3 --max-iterations 5000
  python crossword_generator.py --extract --count 3
  python crossword_generator.py --width 7 --height 7
  python crossword_generator.py --width 10  # height will be set to 10 as well
        """,
    )

    parser.add_argument(
        "--extract",
        action="store_true",
        help="Force re-extraction of clues from JSON files",
    )

    parser.add_argument(
        "--count", type=int, default=1, help="Generate N crosswords (default: 1)"
    )

    parser.add_argument(
        "--max-iterations",
        type=int,
        help="Set maximum total iterations (default: 2000 * count)",
    )

    parser.add_argument(
        "--width", type=int, default=5, help="Width of the crossword grid (default: 5)"
    )

    parser.add_argument(
        "--height",
        type=int,
        default=None,
        help="Height of the crossword grid (default: same as width)",
    )

    return parser.parse_args()


def main():
    """Main workflow for crossword generation."""
    print("Crossword Generator")
    print("==================")

    # Parse command line arguments
    args = parse_arguments()

    # Set height to match width if not specified
    if args.height is None:
        args.height = args.width

    crosswords_dir = "../crosswords"
    master_clues_file = "master_clues.json"

    # Check if crosswords directory exists
    if not Path(crosswords_dir).exists():
        print(f"Error: Crosswords directory '{crosswords_dir}' not found!")
        print("Please ensure the crosswords directory exists and contains JSON files.")
        sys.exit(1)

    # Step 1: Extract clues if master file doesn't exist or if forced
    if not Path(master_clues_file).exists() or args.extract:
        print("\nStep 1: Extracting clue/answer pairs from crossword files...")
        try:
            collins_dictionary = "Collins-Scrabble-Words-2019.tsv"
            master_clues = build_master_clue_list(
                crosswords_dir, collins_dictionary, master_clues_file
            )
            if not master_clues:
                print(
                    "No clues extracted! Check if JSON files exist in the crosswords directory."
                )
                sys.exit(1)
        except Exception as e:
            print(f"Error extracting clues: {e}")
            sys.exit(1)
    else:
        print(f"\nUsing existing clue file: {master_clues_file}")
        print("(Use --extract flag to regenerate)")

    # Step 2: Generate crosswords
    print(f"\nStep 2: Generating new {args.width}x{args.height} crosswords...")
    try:
        generator = CrosswordGenerator(master_clues_file, args.width, args.height)

        # Determine how many crosswords to generate
        num_crosswords = args.count

        # Determine maximum iterations
        if args.max_iterations is not None:
            max_iterations = args.max_iterations
        else:
            max_iterations = 2000 * num_crosswords  # Default: 2000 per crossword

        # Use batch generation for all cases
        print(
            f"Using batch generation: {num_crosswords} crosswords, max {max_iterations} iterations"
        )
        crosswords = generator.generate_crosswords_batch(
            num_crosswords, max_iterations, verbose_level=0
        )

        success_count = 0
        for i, crossword in enumerate(crosswords):
            print(f"\n{'=' * 60}")
            print(f"Crossword #{i + 1} of {len(crosswords)}")
            print("=" * 60)

            crossword.display(
                generator.available_answers, generator.clue_lookup, generator.clue_list
            )

            # Get final words including unintended sequences
            final_words = crossword.get_final_words(
                generator.available_answers, generator.clue_lookup, generator.clue_list
            )
            final_word_count = len(final_words)
            final_used_answers = {word.text for word in final_words}

            # Calculate average quality using final words
            avg_quality = generator.calculate_average_quality(
                crossword, generator.available_answers, generator.clue_lookup
            )

            # Check if this is a valid puzzle (same logic as in generate_single_crossword_attempt)
            empty_squares = crossword.count_empty_squares()
            used_answers = crossword.get_used_answers()
            invalid_sequences = crossword.count_invalid_sequences(
                generator.available_answers
            )

            max_empty_squares = int((crossword.width * crossword.height) * 0.25)
            min_words = max(6, int((crossword.width + crossword.height) * 0.5))

            is_valid = (
                empty_squares <= max_empty_squares
                and len(used_answers) == len(crossword.words)  # No repeated answers
                and len(crossword.words) >= min_words  # Minimum number of words
                and invalid_sequences == 0
                and not crossword.has_excessive_consecutive_empty_squares()  # No excessive consecutive empty squares
            )  # All letter sequences are valid words

            # Determine puzzle type
            if is_valid:
                if avg_quality == 1.0:
                    puzzle_type = "Perfect"
                else:
                    puzzle_type = "Imperfect"
            else:
                puzzle_type = "Constraint-violating"
                # Calculate constraint-violating score for display
                constraint_score = generator._score_constraint_violating_puzzle(
                    crossword
                )

            print("\nStats:")
            print(f"  Empty squares: {empty_squares}")
            print(f"  Total words: {final_word_count}")
            print(f"  Unique answers: {len(final_used_answers)}")
            print(f"  Average quality score: {avg_quality:.2f}")
            print(f"  Puzzle type: {puzzle_type}")
            if puzzle_type == "Constraint-violating":
                print(f"  Constraint-violating penalty: {constraint_score:.1f}")
                # Add consecutive empty square violations count for invalid puzzles
                consecutive_violations = crossword.count_consecutive_empty_violations()
                print(
                    f"  Consecutive empty square violations: {consecutive_violations}"
                )
            success_count += 1

        print(f"\n{'=' * 60}")
        print(
            f"Generated {success_count} out of {num_crosswords} crosswords successfully!"
        )

    except Exception as e:
        print(f"Error generating crosswords: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

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

    def __post_init__(self):
        if self.grid is None:
            self.grid = [["." for _ in range(self.width)] for _ in range(self.height)]
        if self.words is None:
            self.words = []

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
            # Create a temporary grid to check what new sequences would be created
            temp_grid = [row[:] for row in self.grid]  # Deep copy
            if direction == Direction.ACROSS:
                for i, char in enumerate(word):
                    temp_grid[row][col + i] = char
            else:  # DOWN
                for i, char in enumerate(word):
                    temp_grid[row + i][col] = char

            # Only check sequences that are exactly full width/height
            temp_crossword = CrosswordGrid(
                self.width, self.height, temp_grid, self.words[:]
            )
            all_sequences = temp_crossword.get_all_letter_sequences()
            placed_words = temp_crossword.get_placed_words_set()

            for sequence, seq_row, seq_col, seq_direction in all_sequences:
                # Only validate complete sequences (full width for across, full height for down)
                expected_length = (
                    self.width if seq_direction == Direction.ACROSS else self.height
                )
                if len(sequence) == expected_length:
                    if (sequence, seq_row, seq_col, seq_direction) not in placed_words:
                        if sequence not in available_answers:
                            return False

        return True

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

    def count_empty_squares(self) -> int:
        """Count the number of empty squares in the grid."""
        count = 0
        for row in self.grid:
            for cell in row:
                if cell == ".":
                    count += 1
        return count

    def get_used_answers(self) -> Set[str]:
        """Get set of all answers used in this crossword."""
        return {word.text for word in self.words}

    def get_all_letter_sequences(self) -> List[Tuple[str, int, int, Direction]]:
        """Get all contiguous letter sequences in the grid (potential words)."""
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

        return sequences

    def get_placed_words_set(self) -> Set[Tuple[str, int, int, Direction]]:
        """Get set of all placed words as (text, row, col, direction) tuples."""
        return {(word.text, word.row, word.col, word.direction) for word in self.words}

    def count_invalid_sequences(self, available_answers: Set[str]) -> int:
        """Count number of invalid letter sequences in the grid."""
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

                # Check pattern match
                if pattern is not None:
                    if len(answer) != len(pattern):
                        continue
                    matches = True
                    for i, (p, a) in enumerate(zip(pattern, answer)):
                        if p != "." and p != a:
                            matches = False
                            break
                    if not matches:
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
                    # Check if answer matches pattern (. means any character)
                    if len(answer) == len(pattern):
                        matches = True
                        for i, (p, a) in enumerate(zip(pattern, answer)):
                            if p != "." and p != a:
                                matches = False
                                break
                        if matches:
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

            # Check pattern match
            if pattern is not None:
                if len(answer) != len(pattern):
                    continue
                matches = True
                for i, (p, a) in enumerate(zip(pattern, answer)):
                    if p != "." and p != a:
                        matches = False
                        break
                if not matches:
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
        for length in range(3, max_word_length + 1):
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
        # Calculate max words based on grid size (roughly 1.5 words per row/column)
        max_words = max(6, int((self.width + self.height) * 0.75))

        for iteration in range(20):  # Max iterations to add words
            if words_added >= max_words:
                if verbose_iteration_2:
                    tqdm.write(f"  → Reached max words ({max_words})")
                break

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
            List of crosswords, with perfect puzzles first, then imperfect puzzles
        """
        perfect_crosswords = []
        imperfect_crosswords = []

        print(
            f"Generating {count} crosswords with max {max_iterations} total iterations..."
        )

        # Single iteration counter running to max_iterations
        last_perfect_attempts = 0
        for attempt in tqdm(range(max_iterations)):
            verbose_iteration_1 = verbose_level >= 1 and attempt < 1000
            verbose_iteration_2 = verbose_level >= 2 and attempt < 1000

            if verbose_iteration_1 and (attempt % 100 == 0 or attempt < 1000):
                tqdm.write(f"\nAttempt {attempt + 1}:")
                tqdm.write(f"  Perfect puzzles found: {len(perfect_crosswords)}")
                tqdm.write(f"  Imperfect puzzles found: {len(imperfect_crosswords)}")

            # Generate a single crossword attempt
            grid, is_valid, quality_score = self.generate_single_crossword_attempt(
                verbose_iteration_1, verbose_iteration_2
            )

            if grid is None:  # No center words available
                continue

            if is_valid:
                # Create a copy of the grid
                grid_copy = CrosswordGrid(
                    grid.width,
                    grid.height,
                    [row[:] for row in grid.grid],
                    grid.words[:],
                )

                if quality_score == 1.0:
                    # Perfect puzzle
                    perfect_crosswords.append(grid_copy)
                    tqdm.write(
                        f"🎯 Found perfect crossword #{len(perfect_crosswords)} in {attempt + 1 - last_perfect_attempts} attempts! (Quality: {quality_score:.2f})"
                    )
                    last_perfect_attempts = attempt + 1
                else:
                    # Imperfect but valid puzzle
                    imperfect_crosswords.append(grid_copy)
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

        # Prepare final results
        result = []

        # Add perfect puzzles first (up to count)
        perfect_to_add = min(len(perfect_crosswords), count)
        result.extend(perfect_crosswords[:perfect_to_add])

        # Add imperfect puzzles to fill remaining slots
        remaining_slots = count - perfect_to_add
        if remaining_slots > 0:
            imperfect_to_add = min(len(imperfect_crosswords), remaining_slots)
            result.extend(imperfect_crosswords[:imperfect_to_add])

        # Print summary
        print(f"\n{'=' * 60}")
        print("BATCH GENERATION SUMMARY")
        print(f"{'=' * 60}")
        print(f"Total iterations: {max_iterations}")
        print(f"Perfect puzzles found: {len(perfect_crosswords)}")
        print(f"Imperfect puzzles found: {len(imperfect_crosswords)}")
        print(f"Puzzles returned: {len(result)}")
        print(f"Perfect puzzles in result: {perfect_to_add}")
        print(f"Imperfect puzzles in result: {len(result) - perfect_to_add}")

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

            print("\nStats:")
            print(f"  Empty squares: {crossword.count_empty_squares()}")
            print(f"  Total words: {final_word_count}")
            print(f"  Unique answers: {len(final_used_answers)}")
            print(f"  Average quality score: {avg_quality:.2f}")
            print(f"  Puzzle type: {'Perfect' if avg_quality == 1.0 else 'Imperfect'}")
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

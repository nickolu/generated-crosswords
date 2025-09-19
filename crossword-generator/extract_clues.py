#!/usr/bin/env python3
"""
Extracts clue/answer pairs from crossword JSON files and builds a master list.
Now includes Collins Scrabble Words dictionary with quality ratings.
"""

import csv
import json
from pathlib import Path
from typing import Dict, List, Tuple


def extract_clue_answer_pairs(json_file_path: str) -> Dict[str, str]:
    """Extract clue-answer pairs from a single crossword JSON file."""
    clue_answer_pairs = {}
    
    try:
        with open(json_file_path, 'r', encoding='utf-8') as file:
            data = json.load(file)
        
        # Navigate to the crossword data
        body = data.get('body', [])
        if not body:
            return clue_answer_pairs
            
        crossword_data = body[0]  # Assuming first body element contains the puzzle
        cells = crossword_data.get('cells', [])
        clues = crossword_data.get('clues', [])
        
        # For each clue, construct the answer from the cells
        for clue in clues:
            clue_text_list = clue.get('text', [])
            if not clue_text_list:
                continue
                
            clue_text = clue_text_list[0].get('plain', '').strip()
            if not clue_text:
                continue
            
            # Get the cells that make up this answer
            cell_indices = clue.get('cells', [])
            if not cell_indices:
                continue
                
            # Build the answer from the cells
            answer_chars = []
            for cell_index in cell_indices:
                if cell_index < len(cells) and 'answer' in cells[cell_index]:
                    answer_chars.append(cells[cell_index]['answer'])
            
            if answer_chars:
                answer = ''.join(answer_chars)
                if answer and clue_text and not clue_text.startswith("See "):  # Filter out relational clues
                    clue_answer_pairs[clue_text] = answer
                    
    except Exception as e:
        print(f"Error processing {json_file_path}: {e}")
    
    return clue_answer_pairs


def extract_collins_words(collins_file: str) -> List[Tuple[str, str]]:
    """Extract words and definitions from Collins Scrabble Words TSV file."""
    collins_words = []
    
    try:
        with open(collins_file, 'r', encoding='utf-8') as file:
            reader = csv.reader(file, delimiter='\t')
            for row in reader:
                if len(row) >= 2:
                    word = row[0].strip().upper()
                    definition = row[1].strip()
                    
                    # Filter by word length (2-5 letters only)
                    if len(word) < 2 or len(word) > 5:
                        continue
                    
                    # Clean up the definition to create a clue
                    clue = definition
                    
                    # Step 1: Remove word type specifiers in square brackets
                    if '[' in clue:
                        clue = clue.split('[')[0].strip()
                    
                    # Step 2: Strip all caps words and trailing commas/spaces at the start
                    # This handles cases like "ABACUS, definition..." or "WORD definition..."
                    words = clue.split()
                    while words and words[0].isupper():
                        # Remove the all-caps word
                        words = words[1:]
                        # If the next word starts with a comma, remove the comma
                        if words and words[0].startswith(','):
                            words[0] = words[0][1:].strip()
                            if not words[0]:  # If nothing left after removing comma
                                words = words[1:]
                    clue = ' '.join(words).strip()
                    
                    # Step 3: Remove parenthetical strings at the start
                    while clue.startswith('(') and ')' in clue:
                        close_paren = clue.find(')')
                        clue = clue[close_paren + 1:].strip()
                    
                    # Clean up common prefixes
                    if clue.startswith('a '):
                        clue = clue[2:]
                    elif clue.startswith('an '):
                        clue = clue[3:]
                    elif clue.startswith('the '):
                        clue = clue[4:]
                    
                    # Remove strings starting with ", also" from the end
                    if ', also' in clue:
                        # Find the last occurrence of ", also" and remove everything from that point
                        last_also = clue.rfind(', also')
                        if last_also != -1:
                            clue = clue[:last_also].strip()
                    
                    # Capitalize first letter and add only if we have a valid clue
                    if clue:
                        clue = clue[0].upper() + clue[1:] if len(clue) > 1 else clue.upper()
                        collins_words.append((clue, word))
    
    except Exception as e:
        print(f"Error processing Collins dictionary {collins_file}: {e}")
    
    return collins_words


def build_master_clue_list(crosswords_dir: str, collins_file: str = None, output_file: str = "master_clues.json"):
    """Build master list of all clue/answer pairs from crossword files and Collins dictionary."""
    crosswords_path = Path(crosswords_dir)
    master_clues = []  # List of tuples: (clue, answer, quality)
    duplicate_count = 0
    file_count = 0
    seen_pairs = set()  # Track exact clue/answer pairs to avoid duplicates
    answer_quality = {}  # Track the best quality for each answer
    
    print(f"Scanning crossword files in {crosswords_path}...")
    
    # Process all JSON files in the crosswords directory (quality = 1)
    for json_file in crosswords_path.glob("*.json"):
        file_count += 1
        if file_count % 100 == 0:
            print(f"Processed {file_count} files...")
            
        clue_pairs = extract_clue_answer_pairs(str(json_file))
        
        for clue, answer in clue_pairs.items():
            clue_answer_pair = (clue, answer)
            if clue_answer_pair in seen_pairs:
                # Exact same clue/answer pair already exists
                duplicate_count += 1
                continue
            else:
                # Add new clue/answer pair with quality 1 (from existing crosswords)
                seen_pairs.add(clue_answer_pair)
                master_clues.append((clue, answer, 1))
                # Track the best quality for this answer (lower number = higher quality)
                if answer not in answer_quality or 1 < answer_quality[answer]:
                    answer_quality[answer] = 1
    
    print(f"\nProcessed {file_count} crossword files")
    print(f"Found {len(master_clues)} unique clue/answer pairs from crosswords")
    print(f"Skipped {duplicate_count} exact duplicate clue/answer pairs")
    
    # Process Collins dictionary if provided (quality = 2)
    if collins_file and Path(collins_file).exists():
        print(f"\nProcessing Collins dictionary: {collins_file}")
        collins_words = extract_collins_words(collins_file)
        collins_added = 0
        collins_duplicates = 0
        collins_quality_skipped = 0
        
        for clue, answer in collins_words:
            clue_answer_pair = (clue, answer)
            if clue_answer_pair in seen_pairs:
                collins_duplicates += 1
                continue
            
            # Check if we already have a higher quality clue for this answer
            if answer in answer_quality and answer_quality[answer] < 2:
                collins_quality_skipped += 1
                continue
            
            # Add Collins clue/answer pair with quality 2
            seen_pairs.add(clue_answer_pair)
            master_clues.append((clue, answer, 2))
            collins_added += 1
            # Update quality tracking
            if answer not in answer_quality or 2 < answer_quality[answer]:
                answer_quality[answer] = 2
        
        print(f"Added {collins_added} unique clue/answer pairs from Collins dictionary")
        print(f"Skipped {collins_duplicates} Collins pairs that matched existing crossword clues")
        print(f"Skipped {collins_quality_skipped} Collins pairs where higher quality clues already exist")
    
    print(f"\nTotal unique clue/answer pairs: {len(master_clues)}")
    
    # Save to JSON file
    output_path = Path(output_file)
    with open(output_path, 'w', encoding='utf-8') as file:
        json.dump(master_clues, file, indent=2, ensure_ascii=False)
    
    print(f"Master clue list saved to {output_path}")
    return master_clues


if __name__ == "__main__":
    # Extract clues from crosswords directory and Collins dictionary
    crosswords_directory = "../crosswords"
    collins_dictionary = "Collins-Scrabble-Words-2019.tsv"
    master_clues = build_master_clue_list(crosswords_directory, collins_dictionary)
    
    # Print some statistics
    answer_lengths = {}
    quality_counts = {1: 0, 2: 0}
    
    for clue, answer, quality in master_clues:
        length = len(answer)
        answer_lengths[length] = answer_lengths.get(length, 0) + 1
        quality_counts[quality] += 1
    
    print("\nAnswer length distribution:")
    for length in sorted(answer_lengths.keys()):
        print(f"  {length} letters: {answer_lengths[length]} answers")
    
    print("\nQuality distribution:")
    print(f"  Quality 1 (crossword clues): {quality_counts[1]} answers")
    print(f"  Quality 2 (dictionary words): {quality_counts[2]} answers")

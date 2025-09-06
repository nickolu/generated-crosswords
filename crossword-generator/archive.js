class CrosswordArchive {
    constructor() {
        this.today = new Date();
        this.elevenYearsAgo = new Date(this.today.getFullYear() - 11, this.today.getMonth(), this.today.getDate());
        this.loadPuzzleList();
    }

    async loadPuzzleList() {
        const puzzleList = document.getElementById('puzzleList');
        
        try {
            // Fetch the list of available crossword JSON files from the API
            const response = await fetch('crossword-jsons');
            
            if (!response.ok) {
                throw new Error(`Failed to fetch puzzle list: ${response.status}`);
            }
            
            const data = await response.json();
            const knownPuzzleFiles = data.files || [];
            
            if (knownPuzzleFiles.length === 0) {
                throw new Error('No puzzle files found in API response');
            }

            const knownPuzzles = [];

            // Check which puzzle files actually exist and are accessible
            for (const filename of knownPuzzleFiles) {
                try {
                    const puzzleResponse = await fetch(`crosswords/${filename}`, { method: 'HEAD' });
                    if (puzzleResponse.ok) {
                        // Extract date from filename (try multiple patterns)
                        let dateMatch = filename.match(/mini_(\d{4}-\d{2}-\d{2})\.json/);
                        if (!dateMatch) {
                            dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})\.json/);
                        }
                        
                        const date = dateMatch ? dateMatch[1] : filename.replace('.json', '');
                        const puzzleDate = new Date(date + 'T00:00:00');
                        
                        // Filter: only include puzzles that are 11 years ago or older
                        if (puzzleDate <= this.elevenYearsAgo) {
                            const displayName = filename.includes('mini_') ? 
                                `Mini Crossword ${date}` : 
                                `Crossword ${date}`;
                            
                            // Check if this puzzle date is exactly 11 years ago from today
                            const isToday = puzzleDate.getTime() === this.elevenYearsAgo.getTime();
                            
                            knownPuzzles.push({
                                filename: filename,
                                displayName: displayName,
                                date: date,
                                isToday: isToday
                            });
                        }
                    }
                } catch (e) {
                    // Puzzle doesn't exist or isn't accessible, skip
                    console.log(`Puzzle ${filename} not accessible`);
                }
            }

            // If no puzzles found, show error
            if (knownPuzzles.length === 0) {
                throw new Error('No accessible puzzles found');
            }

            this.renderPuzzleList(knownPuzzles);
            
        } catch (error) {
            console.error('Error loading puzzle list:', error);
            puzzleList.innerHTML = `<div class="error">Failed to load puzzle list: ${error.message}</div>`;
        }
    }

    generateRecentDates(count) {
        const dates = [];
        const today = new Date();
        
        for (let i = 0; i < count; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            dates.push(date.toISOString().split('T')[0]);
        }
        
        return dates;
    }

    renderPuzzleList(puzzles) {
        const puzzleList = document.getElementById('puzzleList');
        
        if (puzzles.length === 0) {
            puzzleList.innerHTML = '<div class="error">No puzzles found. Please check that puzzle files exist in the data/ directory.</div>';
            return;
        }

        // Sort puzzles by date (most recent first)
        puzzles.sort((a, b) => new Date(b.date) - new Date(a.date));

        let html = '';
        puzzles.forEach(puzzle => {
            const linkClass = puzzle.isToday ? 'puzzle-item today-link' : 'puzzle-item';
            const href = `mini?puzzle=${puzzle.filename}`;
            
            if (puzzle.isToday) {
                html += `
                    <a href="${href}" class="${linkClass}">
                        <div>
                            <div class="puzzle-name">Today's Puzzle</div>
                            <div class="puzzle-date">${this.formatDate(puzzle.date)}</div>
                        </div>
                        <div>➤</div>
                    </a>
                `;
            } else {
                html += `
                    <a href="${href}" class="${linkClass}">
                        <div>
                            <div class="puzzle-name">${puzzle.displayName}</div>
                            <div class="puzzle-date">${this.formatDate(puzzle.date)}</div>
                        </div>
                        <div>➤</div>
                    </a>
                `;
            }
        });

        puzzleList.innerHTML = html;
    }

    formatDate(dateString) {
        const date = new Date(dateString + 'T00:00:00');
        return date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    new CrosswordArchive();
});

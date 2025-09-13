class CrosswordArchive {
    constructor() {
        this.today = new Date();
        this.elevenYearsAgo = new Date(this.today.getFullYear() - 11, this.today.getMonth(), this.today.getDate());
        this.userName = this.getUserName();
        this.loadPuzzleList();
    }

    getUserName() {
        // Get username from cookies, same as in crossword.js
        return this.getCookie('crossword_user_name') || '';
    }

    getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    async checkPuzzleCompletion(puzzleDate) {
        // Only check completion if we have a username
        if (!this.userName) {
            return false;
        }

        try {
            // Try to load leaderboard data for this puzzle date
            const dataUrl = `data/${puzzleDate}.json`;
            const response = await fetch(dataUrl, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            
            if (!response.ok) {
                return false;
            }
            
            const leaderboardData = await response.json();
            
            // Check if current user has a completion time
            const userCompletionTime = leaderboardData[this.userName];
            return userCompletionTime ? true : false;
            
        } catch (error) {
            // No completion data found
            return false;
        }
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

            // Push puzzle metadata to knownPuzzles
            for (const filename of knownPuzzleFiles) {
                try {
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
                // eslint-disable-next-line no-unused-vars
                } catch (e) {
                    // Puzzle doesn't exist or isn't accessible, skip
                    console.log(`Puzzle ${filename} not accessible`);
                }
            }

            // If no puzzles found, show error
            if (knownPuzzles.length === 0) {
                throw new Error('No accessible puzzles found');
            }

            await this.renderPuzzleList(knownPuzzles);
            
        } catch (error) {
            console.error('Error loading puzzle list:', error);
            puzzleList.innerHTML = `<div class="archive-error">Failed to load puzzle list: ${error.message}</div>`;
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

    async renderPuzzleList(puzzles) {
        const puzzleList = document.getElementById('puzzleList');
        
        if (puzzles.length === 0) {
            puzzleList.innerHTML = '<div class="archive-error">No puzzles found. Please check that puzzle files exist in the data/ directory.</div>';
            return;
        }

        // Sort puzzles by date (most recent first)
        puzzles.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Check completion status for each puzzle if we have a username
        if (this.userName) {
            const completionChecks = puzzles.map(async puzzle => {
                const isCompleted = await this.checkPuzzleCompletion(puzzle.date);
                return { ...puzzle, isCompleted };
            });
            
            try {
                puzzles = await Promise.all(completionChecks);
            } catch (error) {
                console.error('Error checking puzzle completion:', error);
                // Continue with original puzzles if completion check fails
            }
        }

        let html = '';
        puzzles.forEach(puzzle => {
            let linkClass = puzzle.isToday ? 'puzzle-item today-link' : 'puzzle-item';
            if (puzzle.isCompleted) {
                linkClass += ' completed';
            }
            const href = `mini?puzzle=${puzzle.filename}`;
            
            const completedBadge = puzzle.isCompleted ? '<span class="completed-badge">Completed</span>' : '';
            
            if (puzzle.isToday) {
                html += `
                    <a href="${href}" class="${linkClass}">
                        <div>
                            <div class="puzzle-name">Today's Puzzle ${completedBadge}</div>
                            <div class="puzzle-date">${this.formatDate(puzzle.date)}</div>
                        </div>
                        <div>➤</div>
                    </a>
                `;
            } else {
                html += `
                    <a href="${href}" class="${linkClass}">
                        <div>
                            <div class="puzzle-name">${puzzle.displayName} ${completedBadge}</div>
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

class CrosswordStatistics {
    constructor() {
        this.userName = this.getCookie('crossword_user_name') || null;
        this.userStats = {
            solveTimes: [],
            places: [],
            totalCompleted: 0,
            averageTime: 0,
            bestTime: null,
        };
        this.today = new Date();
        this.elevenYearsAgo = new Date(this.today.getFullYear() - 11, this.today.getMonth(), this.today.getDate());
        this.yearOffset = 11; // Same offset used in crossword.js

        // Place emojis matching the crossword game
        this.placeEmojis = {
            1: '🥇',
            2: '🥈',
            3: '🥉',
            4: '🦥',
            5: '🐌',
            6: '🐢',
            default: '⏳', // For 7th place and beyond
        };

        this.init();
    }

    getCookie(name) {
        const nameEQ = name + '=';
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    getRankEmoji(rank) {
        return this.placeEmojis[rank] || this.placeEmojis.default;
    }

    formatTimeFromSeconds(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    calculateDisplayDate(puzzleDate) {
        const pubDate = new Date(puzzleDate);
        const displayDate = new Date(pubDate.setFullYear(pubDate.getFullYear() + this.yearOffset));
        return displayDate.toISOString().split('T')[0];
    }

    async init() {
        if (!this.userName) {
            this.showNoUserMessage();
            return;
        }

        try {
            await this.loadUserStatistics();
            this.renderCharts();
            this.updateStatsSummary();
        } catch (error) {
            console.error('Error loading statistics:', error);
            this.showErrorMessage();
        }
    }

    showNoUserMessage() {
        const statsContent = document.getElementById('statsContent');
        statsContent.innerHTML = `
            <div class="stats-error">
                <h3>No Username Set</h3>
                <p>Please complete a crossword puzzle first to set your username and start tracking statistics.</p>
                <a href="mini" class="nav-btn">Play Today's Puzzle</a>
            </div>
        `;
    }

    showErrorMessage() {
        const statsContent = document.getElementById('statsContent');
        statsContent.innerHTML = `
            <div class="stats-error">
                <h3>Error Loading Statistics</h3>
                <p>There was a problem loading your statistics. Please try again later.</p>
            </div>
        `;
    }

    async loadUserStatistics() {
        const statsContent = document.getElementById('statsContent');
        statsContent.innerHTML = '<div class="stats-loading">Analyzing your puzzle history...</div>';

        // Get list of available crossword files
        const response = await fetch('crossword-jsons');
        if (!response.ok) {
            throw new Error('Failed to fetch puzzle list');
        }

        const data = await response.json();
        const puzzleFiles = data.files || [];

        const userCompletions = [];

        // Check each puzzle for user completion
        for (const filename of puzzleFiles) {
            try {
                // Extract date from filename (same logic as archive.js)
                let dateMatch = filename.match(/mini_(\d{4}-\d{2}-\d{2})\.json/);
                if (!dateMatch) {
                    dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})\.json/);
                }

                if (!dateMatch) continue;

                const puzzleDate = dateMatch[1];
                const puzzleDateObj = new Date(puzzleDate + 'T00:00:00');

                // Filter: only include puzzles that are 11 years ago or older (same as archive.js)
                if (puzzleDateObj > this.elevenYearsAgo) {
                    continue;
                }

                const displayDate = this.calculateDisplayDate(puzzleDate);

                // Check leaderboard data for this date
                const leaderboardResponse = await fetch(`data/${displayDate}.json`, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-cache',
                });

                if (leaderboardResponse.ok) {
                    const leaderboardData = await leaderboardResponse.json();
                    const userTime = leaderboardData[this.userName];

                    if (userTime) {
                        // Calculate user's rank for this puzzle
                        const allTimes = Object.values(leaderboardData)
                            .map((time) => parseInt(time))
                            .sort((a, b) => a - b);

                        const userTimeInt = parseInt(userTime);
                        const userRank = allTimes.indexOf(userTimeInt) + 1;

                        userCompletions.push({
                            date: displayDate,
                            time: userTimeInt,
                            rank: userRank,
                        });
                    }
                }
            } catch (error) {
                // Skip this puzzle if there's an error
                console.log(`Skipping ${filename}:`, error.message);
            }
        }

        // Process the completions into statistics
        this.processStatistics(userCompletions);

        // Update the loading message
        if (userCompletions.length === 0) {
            statsContent.innerHTML = `
                <div class="stats-empty">
                    <h3>No Completed Puzzles</h3>
                    <p>You haven't completed any puzzles yet. Start solving to see your statistics!</p>
                    <a href="mini" class="nav-btn">Play Today's Puzzle</a>
                </div>
            `;
        } else {
            statsContent.innerHTML = `
                <div class="stats-summary-text">
                    Found ${userCompletions.length} completed puzzle${userCompletions.length !== 1 ? 's' : ''} for analysis
                </div>
            `;
        }
    }

    processStatistics(completions) {
        this.userStats.totalCompleted = completions.length;
        this.userStats.solveTimes = completions.map((c) => c.time);
        this.userStats.places = completions.map((c) => c.rank);

        if (completions.length > 0) {
            // Calculate average time
            const totalTime = this.userStats.solveTimes.reduce((sum, time) => sum + time, 0);
            this.userStats.averageTime = Math.round(totalTime / completions.length);

            // Find best time
            this.userStats.bestTime = Math.min(...this.userStats.solveTimes);
        }
    }

    renderCharts() {
        if (this.userStats.totalCompleted === 0) return;

        this.renderSolveTimesChart();
        this.renderPlacesChart();
    }

    renderSolveTimesChart() {
        const canvas = document.getElementById('solveTimesChart');
        const ctx = canvas.getContext('2d');

        // Create time bins: 0-20s, 20-40s, 40-60s, etc., up to 4 minutes, then 4+ minutes
        const bins = [];
        const binLabels = [];

        // Create bins for 0 to 240 seconds (4 minutes) in 20-second intervals
        for (let i = 0; i < 240; i += 20) {
            bins.push(0);
            const endMin = Math.floor((i + 20) / 60);
            const endSec = (i + 20) % 60;
            binLabels.push(`${endMin}:${endSec.toString().padStart(2, '0')}`);
        }
        // Add 4+ minutes bin
        bins.push(0);
        binLabels.push('4:00+');

        // Count times in each bin
        this.userStats.solveTimes.forEach((time) => {
            if (time >= 240) {
                bins[bins.length - 1]++; // 4+ minutes bin
            } else {
                const binIndex = Math.floor(time / 20);
                if (binIndex < bins.length - 1) {
                    bins[binIndex]++;
                }
            }
        });

        this.drawBarChart(ctx, canvas, bins, binLabels, 'Solve Times', '#4a90e2');
    }

    renderPlacesChart() {
        const canvas = document.getElementById('placesChart');
        const ctx = canvas.getContext('2d');

        // Create bins for each emoji place (1-6, then 7+)
        const emojiBins = {};
        const emojiLabels = [];

        // Initialize bins for known emoji places
        for (let i = 1; i <= 6; i++) {
            const emoji = this.getRankEmoji(i);
            emojiBins[emoji] = 0;
            emojiLabels.push(`${emoji}\n${i}${this.getOrdinalSuffix(i)}`);
        }
        // Add 7+ place bin
        const defaultEmoji = this.getRankEmoji(7);
        emojiBins[defaultEmoji] = 0;
        emojiLabels.push(`${defaultEmoji}\n7th+`);

        // Count places in each bin
        this.userStats.places.forEach((place) => {
            const emoji = this.getRankEmoji(place);
            emojiBins[emoji]++;
        });

        const bins = Object.values(emojiBins);
        this.drawBarChart(ctx, canvas, bins, emojiLabels, 'Leaderboard Positions', '#e67e22');
    }

    getOrdinalSuffix(num) {
        const lastDigit = num % 10;
        const lastTwoDigits = num % 100;

        if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
            return 'th';
        }

        switch (lastDigit) {
            case 1:
                return 'st';
            case 2:
                return 'nd';
            case 3:
                return 'rd';
            default:
                return 'th';
        }
    }

    drawBarChart(ctx, canvas, data, labels, title, color) {
        const width = canvas.width;
        const height = canvas.height;
        const padding = 60;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Find max value for scaling
        const maxValue = Math.max(...data);
        if (maxValue === 0) {
            // No data to display
            ctx.fillStyle = '#666';
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No data to display', width / 2, height / 2);
            return;
        }

        const barWidth = chartWidth / data.length;
        const scale = chartHeight / maxValue;

        // Draw bars
        data.forEach((value, index) => {
            const barHeight = value * scale;
            const x = padding + index * barWidth + barWidth * 0.1;
            const y = height - padding - barHeight;
            const actualBarWidth = barWidth * 0.8;

            // Draw bar
            ctx.fillStyle = color;
            ctx.fillRect(x, y, actualBarWidth, barHeight);

            // Draw value on top of bar if greater than 0
            if (value > 0) {
                ctx.fillStyle = '#333';
                ctx.font = '18px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(value, x + actualBarWidth / 2, y - 5);
            }
        });

        // Draw axes
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Y-axis
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        // X-axis
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();

        // Draw labels
        ctx.fillStyle = '#333';
        ctx.font = '15px Arial';
        ctx.textAlign = 'center';

        labels.forEach((label, index) => {
            const x = padding + index * barWidth + barWidth / 2;
            const y = height - padding + 22;

            // Rotate text for solve times chart to fit better
            if (title === 'Solve Times') {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(-Math.PI / 4);
                ctx.fillText(label, 0, 0);
                ctx.restore();
            } else {
                // Handle multi-line labels for leaderboard positions
                const lines = label.split('\n');
                lines.forEach((line, lineIndex) => {
                    ctx.fillText(line, x, y + lineIndex * 20);
                });
            }
        });

        // Draw Y-axis labels
        ctx.textAlign = 'right';
        ctx.font = '15px Arial';
        for (let i = 0; i <= maxValue; i += Math.ceil(maxValue / 5)) {
            const y = height - padding - i * scale;
            ctx.fillText(i.toString(), padding - 10, y + 3);
        }
    }

    updateStatsSummary() {
        if (this.userStats.totalCompleted === 0) return;

        // Show the summary section
        const summaryElement = document.getElementById('statsSummary');
        summaryElement.style.display = 'block';

        // Update values
        document.getElementById('totalCompleted').textContent = this.userStats.totalCompleted;
        document.getElementById('averageTime').textContent = this.formatTimeFromSeconds(this.userStats.averageTime);
        document.getElementById('bestTime').textContent = this.formatTimeFromSeconds(this.userStats.bestTime);

        // Find most common position
        const placeCounts = {};
        this.userStats.places.forEach((place) => {
            placeCounts[place] = (placeCounts[place] || 0) + 1;
        });

        let mostCommonPlace = 1;
        let maxCount = 0;
        for (const [place, count] of Object.entries(placeCounts)) {
            if (count > maxCount) {
                maxCount = count;
                mostCommonPlace = parseInt(place);
            }
        }

        const mostCommonEmoji = this.getRankEmoji(mostCommonPlace);
        document.getElementById('mostCommonPosition').textContent = `${mostCommonEmoji} ${mostCommonPlace}${this.getOrdinalSuffix(
            mostCommonPlace
        )} place`;
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    new CrosswordStatistics();
});

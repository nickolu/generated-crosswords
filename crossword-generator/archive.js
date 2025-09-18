class CrosswordArchive {
  constructor() {
    this.today = new Date();
    this.elevenYearsAgo = new Date(
      this.today.getFullYear() - 11,
      this.today.getMonth(),
      this.today.getDate()
    );
    this.yearOffset = 11; // Same offset used in crossword.js
    this.userName = this.getUserName();

    // Calendar-specific properties
    this.currentDate = new Date(this.elevenYearsAgo);
    this.availablePuzzles = new Map(); // Map of date strings to puzzle data

    // Place emojis matching crossword.js and statistics.js
    this.placeEmojis = {
      1: '🥇',
      2: '🥈',
      3: '🥉',
      4: '🦥',
      5: '🐌',
      6: '🐢',
      default: '⏳', // For 7th place and beyond
    };

    this.loadPuzzleList();
  }

  getUserName() {
    // Get username from cookies, same as in crossword.js
    return this.getCookie('crossword_user_name') || '';
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

  /**
   * Calculate the display date by adding the yearOffset to the puzzle date
   * @param {string} puzzleDate - Date string in YYYY-MM-DD format (from filename)
   * @returns {string} - Display date string in YYYY-MM-DD format (current date)
   */
  calculateDisplayDate(puzzleDate) {
    const pubDate = new Date(puzzleDate);
    const displayDate = new Date(pubDate.setFullYear(pubDate.getFullYear() + this.yearOffset));
    return displayDate.toISOString().split('T')[0];
  }

  /**
   * Format completion time from seconds to MM:SS format
   * @param {number} seconds - Time in seconds
   * @returns {string} - Formatted time string (e.g., "2:34")
   */
  formatTimeFromSeconds(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  async loadPuzzleList() {
    const calendarGrid = document.getElementById('calendarGrid');

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
            const displayName = filename.includes('mini_')
              ? `Mini Crossword ${date}`
              : `Crossword ${date}`;

            // Check if this puzzle date is exactly 11 years ago from today
            const isToday = puzzleDate.getTime() === this.elevenYearsAgo.getTime();

            knownPuzzles.push({
              filename: filename,
              displayName: displayName,
              date: date,
              isToday: isToday,
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

      // Store puzzle data for calendar rendering
      this.storePuzzleData(knownPuzzles);
      this.initializeCalendar();
    } catch (error) {
      console.error('Error loading puzzle list:', error);
      calendarGrid.innerHTML = `<div class="archive-error">Failed to load puzzle list: ${error.message}</div>`;
    }
  }

  storePuzzleData(puzzles) {
    // Store puzzle data in a map for easy lookup by date
    this.availablePuzzles.clear();
    puzzles.forEach(puzzle => {
      this.availablePuzzles.set(puzzle.date, puzzle);
    });
  }

  initializeCalendar() {
    this.setupNavigationHandlers();
    this.renderCalendar();
  }

  setupNavigationHandlers() {
    const prevButton = document.getElementById('prevMonth');
    const nextButton = document.getElementById('nextMonth');
    const todayButton = document.getElementById('todayBtn');

    prevButton.addEventListener('click', () => {
      this.currentDate.setMonth(this.currentDate.getMonth() - 1);
      this.renderCalendar();
    });

    nextButton.addEventListener('click', () => {
      this.currentDate.setMonth(this.currentDate.getMonth() + 1);
      this.renderCalendar();
    });

    todayButton.addEventListener('click', () => {
      // Jump to today's month (which is 11 years ago in puzzle terms)
      this.currentDate = new Date(this.elevenYearsAgo);
      this.renderCalendar();
    });
  }

  async renderCalendar() {
    const monthTitle = document.getElementById('monthTitle');
    const calendarGrid = document.getElementById('calendarGrid');

    // Update month title
    monthTitle.textContent = this.currentDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    // Generate calendar HTML
    const calendarHTML = await this.generateCalendarHTML();
    calendarGrid.innerHTML = calendarHTML;
  }

  async generateCalendarHTML() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

    let html = '<div class="calendar-days-header">';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(day => {
      html += `<div class="calendar-day-header">${day}</div>`;
    });
    html += '</div>';

    html += '<div class="calendar-days-grid">';

    // Add empty cells for days before the first day of month
    for (let i = 0; i < startingDayOfWeek; i++) {
      html += '<div class="calendar-day empty"></div>';
    }

    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const puzzleData = this.availablePuzzles.get(dateStr);

      let dayContent = '';
      let dayClass = 'calendar-day';
      let clickHandler = '';

      if (puzzleData) {
        // Check if this puzzle is completed
        const completionData = await this.getCompletionData(dateStr);

        if (completionData) {
          // Puzzle completed - show time and place emoji
          const timeStr = this.formatTimeFromSeconds(completionData.time);
          const placeEmoji = this.getRankEmoji(completionData.rank);
          dayContent = `
                        <div class="day-number">${day}</div>
                        <div class="completion-info">
                            <div class="completion-time">${timeStr}</div>
                            <div class="completion-place">${placeEmoji}</div>
                        </div>
                    `;
          dayClass += ' completed';
        } else {
          // Puzzle available but not completed
          dayContent = `
                        <div class="day-number">${day}</div>
                        <div class="play-button">Play</div>
                    `;
          dayClass += ' available';
        }

        clickHandler = `onclick="window.location.href='mini?puzzle=${puzzleData.filename}'"`;
      } else {
        // No puzzle available for this date
        dayContent = `<div class="day-number">${day}</div>`;
        dayClass += ' unavailable';
      }

      html += `<div class="${dayClass}" ${clickHandler}>${dayContent}</div>`;
    }

    html += '</div>';
    return html;
  }

  async getCompletionData(puzzleDate) {
    // Only check completion if we have a username
    if (!this.userName) {
      return null;
    }

    try {
      // Calculate the display date (current date) for leaderboard lookup
      const displayDate = this.calculateDisplayDate(puzzleDate);
      const dataUrl = `data/${displayDate}.json`;

      const response = await fetch(dataUrl, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });

      if (!response.ok) {
        return null;
      }

      const leaderboardData = await response.json();
      const userTime = leaderboardData[this.userName];

      if (!userTime) {
        return null;
      }

      // Calculate user's rank
      const allTimes = Object.values(leaderboardData)
        .map(time => parseInt(time))
        .sort((a, b) => a - b);

      const userTimeInt = parseInt(userTime);
      const userRank = allTimes.indexOf(userTimeInt) + 1;

      return {
        time: userTimeInt,
        rank: userRank,
      };
    } catch {
      return null;
    }
  }

  // Helper method to get the emoji for a given rank
  getRankEmoji(rank) {
    return this.placeEmojis[rank] || this.placeEmojis.default;
  }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
  new CrosswordArchive();
});

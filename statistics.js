class CrosswordStatistics {
  constructor() {
    this.userName = this.getCookie('crossword_user_name') || null;
    this.userStats = {
      solveTimes: [],
      places: [],
      completions: [],
      totalCompleted: 0,
      averageTime: 0,
      bestTime: null,
    };
    this.timeSeriesRange = 'all';
    this.timeSeriesFiltersInitialized = false;
    this.timeSeriesHoverInitialized = false;
    this.timeSeriesHover = null;
    this.timeSeriesChartData = null;
    this.allPlayersStats = {}; // Store stats for all players (all-time)
    this.allPlayersStatsByYear = {}; // Store stats for all players by year
    this.totalPuzzlesAllTime = 0;
    this.totalPuzzlesByYear = {};
    this.nonCreditDates = new Set(); // Display dates that don't count for credit
    this.currentYear = null; // Currently selected year for pagination
    this.availableYears = []; // List of years with data
    this.today = new Date();
    this.elevenYearsAgo = new Date(
      this.today.getFullYear() - 11,
      this.today.getMonth(),
      this.today.getDate()
    );
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

    // Scoring system for sorting
    this.placeScores = {
      1: 10,
      2: 5,
      3: 3,
      4: 2,
      5: 1,
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
      // Trigger migration if database doesn't exist
      await this.ensureMigration();

      await this.loadUserStatistics();
      this.renderSolveTimesChart();
      this.renderTimeSeriesChart();
      this.updateStatsSummary();
      await this.renderPlayerComparisonTable();
    } catch (error) {
      console.error('Error loading statistics:', error);
      this.showErrorMessage();
    }
  }

  async ensureMigration() {
    try {
      const response = await fetch('mini/migrate', {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
      });
      if (response.ok) {
        const result = await response.json();
        console.log('Migration status:', result.status);
      }
    } catch (error) {
      // Migration endpoint may not be available, continue anyway
      console.warn('Migration check failed (non-critical):', error);
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

    // Load non-credit dates (days that don't count for stats / streaks)
    this.nonCreditDates = new Set();
    try {
      const nonCreditResponse = await fetch('mini/non-credit-dates', {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
      });
      if (nonCreditResponse.ok) {
        const nonCreditData = await nonCreditResponse.json();
        (nonCreditData.dates || []).forEach(date => this.nonCreditDates.add(date));
      }
    } catch (error) {
      console.warn('Failed to fetch non-credit dates:', error);
    }

    // Get list of available crossword files
    const puzzleFilesResponse = await fetch('mini/crossword-jsons');
    if (!puzzleFilesResponse.ok) {
      throw new Error('Failed to fetch puzzle list');
    }

    const puzzleData = await puzzleFilesResponse.json();
    const puzzleFiles = puzzleData.files || [];

    // Fetch all leaderboard data in one request (optimized)
    let allLeaderboards = {};
    try {
      const leaderboardsResponse = await fetch('mini/statistics/all-leaderboards', {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
      });
      if (leaderboardsResponse.ok) {
        allLeaderboards = await leaderboardsResponse.json();
      }
    } catch (error) {
      console.warn('Failed to fetch all leaderboards, falling back to individual requests:', error);
      // Fall back to empty object - will skip processing but won't crash
    }

    const userCompletions = [];

    // Process each puzzle file
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

        // Non-credit days are excluded from all solve statistics
        if (this.nonCreditDates.has(displayDate)) {
          continue;
        }

        // Get leaderboard data from the pre-fetched data
        const leaderboardData = allLeaderboards[displayDate];
        if (!leaderboardData) {
          continue;
        }

        const userTime = leaderboardData[this.userName];

        // Process all players' data for comparison table (tie-aware ranks)
        const allTimes = Object.entries(leaderboardData)
          .map(([name, time]) => ({ name, time: parseInt(time) }))
          .sort((a, b) => a.time - b.time);

        // Assign tie-aware ranks
        let previousTime = null;
        let previousRank = 0;
        allTimes.forEach((entry, index) => {
          if (index === 0) {
            entry.rank = 1;
          } else if (entry.time === previousTime) {
            entry.rank = previousRank;
          } else {
            entry.rank = index + 1;
          }
          previousTime = entry.time;
          previousRank = entry.rank;
        });

        // Extract year from displayDate
        const displayYear = parseInt(displayDate.split('-')[0]);

        this.totalPuzzlesAllTime++;
        if (!this.totalPuzzlesByYear[displayYear]) {
          this.totalPuzzlesByYear[displayYear] = 0;
        }
        this.totalPuzzlesByYear[displayYear]++;

        // Store rankings for all players using tie-aware ranks (all-time)
        allTimes.forEach(entry => {
          const rank = entry.rank;
          if (!this.allPlayersStats[entry.name]) {
            this.allPlayersStats[entry.name] = {};
          }
          if (!this.allPlayersStats[entry.name][rank]) {
            this.allPlayersStats[entry.name][rank] = 0;
          }
          this.allPlayersStats[entry.name][rank]++;
        });

        // Store rankings by year
        allTimes.forEach(entry => {
          const rank = entry.rank;
          if (!this.allPlayersStatsByYear[displayYear]) {
            this.allPlayersStatsByYear[displayYear] = {};
          }
          if (!this.allPlayersStatsByYear[displayYear][entry.name]) {
            this.allPlayersStatsByYear[displayYear][entry.name] = {};
          }
          if (!this.allPlayersStatsByYear[displayYear][entry.name][rank]) {
            this.allPlayersStatsByYear[displayYear][entry.name][rank] = 0;
          }
          this.allPlayersStatsByYear[displayYear][entry.name][rank]++;
        });

        if (userTime) {
          const userTimeInt = parseInt(userTime);
          // Find user's tie-aware rank from the computed entries
          const userEntry = allTimes.find(entry => entry.name === this.userName);
          const userRank = userEntry
            ? userEntry.rank
            : allTimes.findIndex(e => e.time === userTimeInt) + 1;

          userCompletions.push({
            date: displayDate,
            time: userTimeInt,
            rank: userRank,
          });
        }
      } catch (error) {
        // Skip this puzzle if there's an error
        console.log(`Skipping ${filename}:`, error.message);
      }
    }

    // Process the completions into statistics
    this.processStatistics(userCompletions);

    // Build list of available years (include all years with data, including current year)
    this.availableYears = Object.keys(this.allPlayersStatsByYear)
      .map(year => parseInt(year))
      .sort((a, b) => b - a); // Sort descending (most recent first)

    // Set default year to most recent year, or null for "All Time"
    this.currentYear = this.availableYears.length > 0 ? this.availableYears[0] : null;

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
      // Clear the content - stats summary will be shown instead
      statsContent.innerHTML = '';
    }
  }

  processStatistics(completions) {
    this.userStats.totalCompleted = completions.length;
    this.userStats.completions = [...completions].sort((a, b) => a.date.localeCompare(b.date));
    this.userStats.solveTimes = completions.map(c => c.time);
    this.userStats.places = completions.map(c => c.rank);

    if (completions.length > 0) {
      // Calculate average time
      const totalTime = this.userStats.solveTimes.reduce((sum, time) => sum + time, 0);
      this.userStats.averageTime = Math.round(totalTime / completions.length);

      // Find best time
      this.userStats.bestTime = Math.min(...this.userStats.solveTimes);
    }
  }

  renderSolveTimesChart() {
    if (this.userStats.totalCompleted === 0) return;
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
    this.userStats.solveTimes.forEach(time => {
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

  filterCompletionsByRange(completions, range) {
    if (range === 'all') return completions;

    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    if (range === 'month') {
      cutoff.setDate(cutoff.getDate() - 30);
    } else if (range === 'year') {
      cutoff.setDate(cutoff.getDate() - 365);
    }

    return completions.filter(c => new Date(c.date + 'T00:00:00') >= cutoff);
  }

  medianOf(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  computeMovingMedian(completions, windowDays = 30) {
    const sorted = [...completions].sort((a, b) => a.date.localeCompare(b.date));

    return sorted.map(point => {
      const pointDate = new Date(point.date + 'T00:00:00');
      const windowStart = new Date(pointDate);
      windowStart.setDate(windowStart.getDate() - (windowDays - 1));

      const timesInWindow = sorted
        .filter(c => {
          const d = new Date(c.date + 'T00:00:00');
          return d >= windowStart && d <= pointDate;
        })
        .map(c => c.time);

      return { date: point.date, medianTime: this.medianOf(timesInWindow) };
    });
  }

  setupTimeSeriesFilters() {
    if (this.timeSeriesFiltersInitialized) return;

    const filters = document.getElementById('timeSeriesFilters');
    if (!filters) return;

    filters.querySelectorAll('[data-range]').forEach(btn => {
      btn.addEventListener('click', e => {
        this.timeSeriesRange = e.target.getAttribute('data-range');
        filters.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.renderTimeSeriesChart();
      });
    });

    this.timeSeriesFiltersInitialized = true;
  }

  renderTimeSeriesChart() {
    if (this.userStats.totalCompleted === 0) return;

    const canvas = document.getElementById('timeSeriesChart');
    if (!canvas) return;

    this.setupTimeSeriesFilters();

    const filtered = this.filterCompletionsByRange(
      this.userStats.completions,
      this.timeSeriesRange
    );
    const movingMedian = this.computeMovingMedian(filtered, 30);
    const ctx = canvas.getContext('2d');
    this.timeSeriesChartData = { completions: filtered, movingMedian };
    this.timeSeriesHover = null;
    const tooltip = document.getElementById('timeSeriesTooltip');
    if (tooltip) tooltip.hidden = true;
    this.drawTimeSeriesChart(ctx, canvas, filtered, movingMedian);
    this.setupTimeSeriesHover(canvas);
  }

  setupTimeSeriesHover(canvas) {
    if (this.timeSeriesHoverInitialized) return;

    const tooltip = document.getElementById('timeSeriesTooltip');
    if (!tooltip) return;

    canvas.addEventListener('mousemove', e => {
      if (!this.timeSeriesChartState) return;

      const { x, y } = this.getCanvasPointer(canvas, e);
      const { padding, width, height, smoothCoords } = this.timeSeriesChartState;

      const inPlotArea =
        x >= padding.left &&
        x <= width - padding.right &&
        y >= padding.top &&
        y <= height - padding.bottom;

      if (!inPlotArea || !smoothCoords || smoothCoords.length < 2) {
        if (this.timeSeriesHover !== null) {
          this.timeSeriesHover = null;
          this.redrawTimeSeriesChart(canvas);
          this.updateTimeSeriesTooltip(null, canvas, tooltip);
        }
        canvas.style.cursor = 'default';
        return;
      }

      const hoverPoint = this.interpolateSmoothAtX(smoothCoords, x);
      if (!hoverPoint) return;

      this.timeSeriesHover = hoverPoint;
      canvas.style.cursor = 'crosshair';
      this.redrawTimeSeriesChart(canvas);
      this.updateTimeSeriesTooltip(hoverPoint, canvas, tooltip);
    });

    canvas.addEventListener('mouseleave', () => {
      this.timeSeriesHover = null;
      canvas.style.cursor = 'default';
      this.redrawTimeSeriesChart(canvas);
      this.updateTimeSeriesTooltip(null, canvas, tooltip);
    });

    this.timeSeriesHoverInitialized = true;
  }

  getCanvasPointer(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  interpolateSmoothAtX(coords, x) {
    if (!coords.length) return null;

    if (x <= coords[0].x) {
      return { ...coords[0], x };
    }
    if (x >= coords[coords.length - 1].x) {
      return { ...coords[coords.length - 1], x };
    }

    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      if (x >= a.x && x <= b.x) {
        const span = b.x - a.x || 1;
        const u = (x - a.x) / span;
        return {
          x,
          y: a.y + u * (b.y - a.y),
          t: a.t + u * (b.t - a.t),
          v: a.v + u * (b.v - a.v),
        };
      }
    }

    return null;
  }

  formatTooltipDate(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  updateTimeSeriesTooltip(hover, canvas, tooltip) {
    if (!hover) {
      tooltip.hidden = true;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const displayX = (hover.x / canvas.width) * rect.width;
    const displayY = (hover.y / canvas.height) * rect.height;

    tooltip.hidden = false;
    tooltip.textContent = `${this.formatTooltipDate(hover.t)} · ${this.formatTimeFromSeconds(Math.round(hover.v))}`;
    tooltip.style.left = `${displayX}px`;
    tooltip.style.top = `${displayY}px`;
    tooltip.style.transform = 'translate(-50%, calc(-100% - 10px))';
  }

  redrawTimeSeriesChart(canvas) {
    if (!this.timeSeriesChartData) return;
    const { completions, movingMedian } = this.timeSeriesChartData;
    const ctx = canvas.getContext('2d');
    this.drawTimeSeriesChart(ctx, canvas, completions, movingMedian, this.timeSeriesHover);
  }

  parseChartDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').getTime();
  }

  formatAxisDate(dateStr, spanDays) {
    const d = new Date(dateStr + 'T00:00:00');
    if (spanDays > 365) {
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  catmullRomInterpolate(v0, v1, v2, v3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * v1 +
        (-v0 + v2) * t +
        (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
        (-v0 + 3 * v1 - 3 * v2 + v3) * t3)
    );
  }

  getSmoothMedianCoords(movingMedian, xScale, yScale, segmentsPerSpan = 6) {
    const pts = movingMedian.map(p => ({
      t: this.parseChartDate(p.date),
      v: p.medianTime,
    }));

    if (pts.length < 2) {
      return pts.map(p => ({ x: xScale(p.t), y: yScale(p.v), t: p.t, v: p.v }));
    }

    const smooth = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const startStep = i === 0 ? 0 : 1;

      for (let s = startStep; s <= segmentsPerSpan; s++) {
        const u = s / segmentsPerSpan;
        const t = p1.t + u * (p2.t - p1.t);
        const v = this.catmullRomInterpolate(p0.v, p1.v, p2.v, p3.v, u);
        smooth.push({ x: xScale(t), y: yScale(v), t, v });
      }
    }

    return smooth;
  }

  strokeMedianLine(ctx, coords) {
    if (coords.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i].x, coords[i].y);
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 5.5;
    ctx.stroke();
    ctx.strokeStyle = '#e67e22';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  drawTimeSeriesHoverOverlay(ctx, hover, padding, height) {
    ctx.save();
    ctx.strokeStyle = 'rgba(230, 126, 34, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(hover.x, padding.top);
    ctx.lineTo(hover.x, height - padding.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#e67e22';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawTimeSeriesChart(ctx, canvas, completions, movingMedian, hover = null) {
    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 30, right: 30, bottom: 60, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    if (completions.length === 0) {
      this.timeSeriesChartState = null;
      ctx.fillStyle = '#666';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('No data for selected range', width / 2, height / 2);
      return;
    }

    const dates = completions.map(c => this.parseChartDate(c.date));
    const times = completions.map(c => c.time);
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const spanDays = (maxDate - minDate) / (1000 * 60 * 60 * 24);
    const dateRange = maxDate - minDate || 1;

    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timePadding = Math.max(10, Math.round((maxTime - minTime) * 0.1));
    const yMin = Math.max(0, minTime - timePadding);
    const yMax = maxTime + timePadding;
    const timeRange = yMax - yMin || 1;

    const xScale = date => padding.left + ((date - minDate) / dateRange) * chartWidth;
    const yScale = time => padding.top + chartHeight - ((time - yMin) / timeRange) * chartHeight;

    // Grid lines and Y-axis labels
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#333';
    ctx.font = '13px Arial';
    ctx.textAlign = 'right';

    const yTickCount = 5;
    for (let i = 0; i <= yTickCount; i++) {
      const time = yMin + (timeRange * i) / yTickCount;
      const y = yScale(time);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(this.formatTimeFromSeconds(Math.round(time)), padding.left - 8, y + 4);
    }

    // X-axis date labels
    ctx.textAlign = 'center';
    const xTickCount = Math.min(6, completions.length);
    for (let i = 0; i <= xTickCount; i++) {
      const date = minDate + (dateRange * i) / xTickCount;
      const x = xScale(date);
      const d = new Date(date);
      const labelDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      ctx.save();
      ctx.translate(x, height - padding.bottom + 18);
      ctx.rotate(-Math.PI / 6);
      ctx.fillText(this.formatAxisDate(labelDate, spanDays), 0, 0);
      ctx.restore();
    }

    // Axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // Individual puzzle times as dots (drawn beneath the median line)
    completions.forEach(point => {
      const x = xScale(this.parseChartDate(point.date));
      const y = yScale(point.time);
      ctx.fillStyle = '#4a90e2';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2c5aa0';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // 30-day moving median line (on top of dots, Catmull-Rom smoothed)
    let smoothCoords = null;
    if (movingMedian.length > 1) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      smoothCoords = this.getSmoothMedianCoords(movingMedian, xScale, yScale);
      this.strokeMedianLine(ctx, smoothCoords);
    }

    this.timeSeriesChartState = {
      padding,
      width,
      height,
      smoothCoords,
    };

    if (hover && smoothCoords) {
      this.drawTimeSeriesHoverOverlay(ctx, hover, padding, height);
    }

    // Legend
    ctx.font = '13px Arial';
    ctx.textAlign = 'left';
    const legendY = padding.top - 8;
    ctx.fillStyle = '#4a90e2';
    ctx.beginPath();
    ctx.arc(padding.left + 6, legendY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.fillText('Puzzle time', padding.left + 16, legendY + 4);

    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(padding.left + 110, legendY);
    ctx.lineTo(padding.left + 140, legendY);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 5.5;
    ctx.stroke();
    ctx.strokeStyle = '#e67e22';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.fillText('30-day median', padding.left + 146, legendY + 4);
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

  async updateStatsSummary() {
    if (this.userStats.totalCompleted === 0) return;

    // Show the summary section
    const summaryElement = document.getElementById('statsSummary');
    summaryElement.style.display = 'block';

    // Update values
    document.getElementById('totalCompleted').textContent = this.userStats.totalCompleted;
    document.getElementById('averageTime').textContent = this.formatTimeFromSeconds(
      this.userStats.averageTime
    );
    document.getElementById('bestTime').textContent = this.formatTimeFromSeconds(
      this.userStats.bestTime
    );

    // Find most common position
    const placeCounts = {};
    this.userStats.places.forEach(place => {
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
    document.getElementById('mostCommonPosition').textContent =
      `${mostCommonEmoji} ${mostCommonPlace}${this.getOrdinalSuffix(mostCommonPlace)} place`;

    // Fetch and display streaks
    if (this.userName) {
      try {
        // Fetch current streak
        const currentStreakResponse = await fetch(
          `mini/streak/${encodeURIComponent(this.userName)}`,
          {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache',
          }
        );
        if (currentStreakResponse.ok) {
          const currentStreakData = await currentStreakResponse.json();
          const currentStreak = currentStreakData.streak || 0;
          document.getElementById('currentStreak').textContent =
            `${currentStreak} day${currentStreak !== 1 ? 's' : ''}`;
        } else {
          document.getElementById('currentStreak').textContent = '0 days';
        }

        // Fetch longest streak
        const longestStreakResponse = await fetch(
          `mini/streak/longest/${encodeURIComponent(this.userName)}`,
          {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache',
          }
        );
        if (longestStreakResponse.ok) {
          const longestStreakData = await longestStreakResponse.json();
          const longestStreak = longestStreakData.longest_streak || 0;
          document.getElementById('longestStreak').textContent =
            `${longestStreak} day${longestStreak !== 1 ? 's' : ''}`;
        } else {
          document.getElementById('longestStreak').textContent = '0 days';
        }
      } catch (error) {
        console.warn('Failed to fetch streaks:', error);
        document.getElementById('currentStreak').textContent = '0 days';
        document.getElementById('longestStreak').textContent = '0 days';
      }
    }
  }

  calculatePlayerScore(placeCounts) {
    let score = 0;
    for (const [place, count] of Object.entries(placeCounts)) {
      const placeNum = parseInt(place);
      const placeScore = this.placeScores[placeNum] || 0;
      score += placeScore * count;
    }
    return score;
  }

  getPlayerGamesPlayed(placeCounts) {
    return Object.values(placeCounts).reduce((sum, count) => sum + count, 0);
  }

  getYearWinner(year) {
    // Calculate winner(s) for a specific year
    // Returns the first winner if there's a tie (for display purposes)
    if (!this.allPlayersStatsByYear[year]) return null;

    let maxScore = -1;
    let winner = null;

    for (const [name, placeCounts] of Object.entries(this.allPlayersStatsByYear[year])) {
      const score = this.calculatePlayerScore(placeCounts);
      if (score > maxScore) {
        maxScore = score;
        winner = name;
      }
    }

    return winner;
  }

  async renderPlayerComparisonTable() {
    if (Object.keys(this.allPlayersStats).length === 0) return;

    const tableContainer = document.getElementById('playerComparisonTable');
    const sectionContainer = document.getElementById('playerComparisonSection');
    if (!tableContainer || !sectionContainer) return;

    const currentYear = this.today.getFullYear();

    // Get stats for current year selection (or all-time)
    const statsToUse =
      this.currentYear === null
        ? this.allPlayersStats
        : this.allPlayersStatsByYear[this.currentYear] || {};

    if (Object.keys(statsToUse).length === 0) {
      tableContainer.innerHTML = '<p>No data available for the selected year.</p>';
      sectionContainer.style.display = 'block';
      return;
    }

    // Calculate winner for current year (if not "All Time")
    const yearWinner = this.currentYear !== null ? this.getYearWinner(this.currentYear) : null;

    // Calculate max counts for each place for color coding
    const maxCounts = {};
    for (let place = 1; place <= 7; place++) {
      maxCounts[place] = 0;
    }

    for (const playerStats of Object.values(statsToUse)) {
      for (let place = 1; place <= 6; place++) {
        const count = playerStats[place] || 0;
        maxCounts[place] = Math.max(maxCounts[place], count);
      }
      // Handle 7+ places
      let sevenPlusCount = 0;
      for (const [place, count] of Object.entries(playerStats)) {
        if (parseInt(place) >= 7) {
          sevenPlusCount += count;
        }
      }
      maxCounts[7] = Math.max(maxCounts[7], sevenPlusCount);
    }

    // Sort players by score
    const sortedPlayers = Object.entries(statsToUse)
      .map(([name, placeCounts]) => ({
        name,
        placeCounts,
        score: this.calculatePlayerScore(placeCounts),
      }))
      .sort((a, b) => b.score - a.score);

    // Fetch max streaks for all players
    const usernames = sortedPlayers.map(p => p.name);
    let maxStreaks = {};

    try {
      const requestBody = { usernames };
      if (this.currentYear !== null) {
        requestBody.year = this.currentYear;
      }

      const response = await fetch('mini/streaks/max', {
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        maxStreaks = await response.json();
      } else {
        console.warn('Failed to fetch max streaks:', response.status);
      }
    } catch (error) {
      console.warn('Failed to fetch max streaks:', error);
    }

    // Add max streak and unplayed count to each player object
    const totalPuzzles =
      this.currentYear === null
        ? this.totalPuzzlesAllTime
        : this.totalPuzzlesByYear[this.currentYear] || 0;

    sortedPlayers.forEach(player => {
      player.maxStreak = maxStreaks[player.name] || 0;
      const gamesPlayed = this.getPlayerGamesPlayed(player.placeCounts);
      player.unplayed = Math.max(0, totalPuzzles - gamesPlayed);
    });

    // Build year pagination controls
    let paginationHTML = '<div class="year-pagination">';
    paginationHTML += '<span class="year-pagination-label">View:</span>';

    // Add "All Time" option
    const allTimeClass = this.currentYear === null ? 'active' : '';
    paginationHTML += `<button class="year-btn ${allTimeClass}" data-year="all">All Time</button>`;

    // Add year buttons
    this.availableYears.forEach(year => {
      const yearClass = this.currentYear === year ? 'active' : '';
      paginationHTML += `<button class="year-btn ${yearClass}" data-year="${year}">${year}</button>`;
    });

    paginationHTML += '</div>';

    // Add event listeners for year buttons (scoped to player comparison only)
    setTimeout(() => {
      tableContainer.querySelectorAll('.year-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          const yearValue = e.target.getAttribute('data-year');
          if (yearValue === 'all') {
            this.currentYear = null;
          } else {
            this.currentYear = parseInt(yearValue);
          }
          this.renderPlayerComparisonTable().catch(err => {
            console.error('Error rendering player comparison table:', err);
          });
        });
      });
    }, 0);

    // Build table HTML
    let tableHTML = paginationHTML;
    tableHTML += `
      <table class="player-comparison">
        <thead>
          <tr>
            <th class="player-name-header">Player</th>
            <th class="place-header">${this.getRankEmoji(1)}</th>
            <th class="place-header">${this.getRankEmoji(2)}</th>
            <th class="place-header">${this.getRankEmoji(3)}</th>
            <th class="place-header">${this.getRankEmoji(4)}</th>
            <th class="place-header">${this.getRankEmoji(5)}</th>
            <th class="place-header">${this.getRankEmoji(6)}</th>
            <th class="place-header">${this.getRankEmoji(7)}</th>
            <th class="unplayed-header">❌</th>
            <th class="max-streak-header">Max Streak</th>
            <th class="score-header">Score</th>
          </tr>
        </thead>
        <tbody>
    `;

    sortedPlayers.forEach(player => {
      const isCurrentUser = player.name === this.userName;
      const rowClass = isCurrentUser ? 'current-user-row' : '';
      // Only show crown for completed years (years before current year)
      const isYearWinner =
        yearWinner &&
        player.name === yearWinner &&
        this.currentYear !== null &&
        this.currentYear < currentYear;
      const playerNameDisplay = isYearWinner ? `${player.name} 👑` : player.name;

      tableHTML += `<tr class="${rowClass}">`;
      tableHTML += `<td class="player-name">${playerNameDisplay}</td>`;

      // Add cells for places 1-6
      for (let place = 1; place <= 6; place++) {
        const count = player.placeCounts[place] || 0;
        const ratio = maxCounts[place] > 0 ? count / maxCounts[place] : 0;
        const backgroundColor = this.getColorForRatio(ratio);
        const cellClass = count > 0 ? 'has-value' : 'no-value';

        tableHTML += `
          <td class="place-count ${cellClass}" style="background-color: ${backgroundColor}">
            ${count > 0 ? count : ''}
          </td>
        `;
      }

      // Add cell for 7+ places
      let sevenPlusCount = 0;
      for (const [place, count] of Object.entries(player.placeCounts)) {
        if (parseInt(place) >= 7) {
          sevenPlusCount += count;
        }
      }
      const sevenPlusRatio = maxCounts[7] > 0 ? sevenPlusCount / maxCounts[7] : 0;
      const sevenPlusColor = this.getColorForRatio(sevenPlusRatio);
      const sevenPlusCellClass = sevenPlusCount > 0 ? 'has-value' : 'no-value';

      tableHTML += `
        <td class="place-count ${sevenPlusCellClass}" style="background-color: ${sevenPlusColor}">
          ${sevenPlusCount > 0 ? sevenPlusCount : ''}
        </td>
      `;

      // Add unplayed games cell
      tableHTML += `<td class="player-unplayed">${player.unplayed > 0 ? player.unplayed : ''}</td>`;

      // Add max streak cell
      tableHTML += `<td class="player-max-streak">${player.maxStreak}</td>`;

      // Add score cell
      tableHTML += `<td class="player-score">${player.score}</td>`;
      tableHTML += '</tr>';
    });

    tableHTML += `
        </tbody>
      </table>
    `;

    tableContainer.innerHTML = tableHTML;
    sectionContainer.style.display = 'block';
  }

  getColorForRatio(ratio) {
    if (ratio === 0) return 'transparent';

    // Create a color gradient from light to dark based on ratio
    // Using a green-blue gradient that goes from very light to more saturated
    const hue = 200; // Blue-ish color
    const lightness = 95 - ratio * 40; // From 95% (very light) to 55% (darker)
    const saturation = 40 + ratio * 40; // From 40% to 80%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
  new CrosswordStatistics();
});

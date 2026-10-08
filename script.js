document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('lcgForm');
    const inputs = {
        seed: document.getElementById('seedInput'),
        multiplier: document.getElementById('aInput'),
        increment: document.getElementById('cInput'),
        modulus: document.getElementById('mInput'),
        iterations: document.getElementById('nInput')
    };
    const validationAlert = document.getElementById('validationAlert');
    const stepContainer = document.getElementById('stepBreakdownContainer');
    const sequenceDisplay = document.getElementById('sequenceDisplay');
    const tableBody = document.getElementById('sequenceTableBody');
    const periodCard = document.getElementById('periodCard');
    const summaryCard = document.getElementById('summaryCard');
    const chartNotice = document.getElementById('chartNotice');
    let valueChart = null;
    let normalizedChart = null;

    function readInteger(input, label) {
        const value = input.value.trim();
        if (!/^\d+$/.test(value)) {
            throw new Error(`${label} must be a whole number.`);
        }
        const parsed = BigInt(value);
        if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error(`${label} must not exceed ${Number.MAX_SAFE_INTEGER}.`);
        }
        return parsed;
    }

    function validateInputs() {
        const seed = readInteger(inputs.seed, 'Seed (X₀)');
        const multiplier = readInteger(inputs.multiplier, 'Multiplier (a)');
        const increment = readInteger(inputs.increment, 'Increment (c)');
        const modulus = readInteger(inputs.modulus, 'Modulus (m)');
        const iterations = readInteger(inputs.iterations, 'Iterations (N)');

        if (modulus <= 0n) {
            throw new Error('Modulus (m) must be greater than 0.');
        }
        if (seed >= modulus) {
            throw new Error('Seed (X₀) must be greater than or equal to 0 and less than the modulus (m).');
        }
        if (multiplier >= modulus) {
            throw new Error('Multiplier (a) must be greater than or equal to 0 and less than the modulus (m).');
        }
        if (increment >= modulus) {
            throw new Error('Increment (c) must be greater than or equal to 0 and less than the modulus (m).');
        }
        if (iterations < 1n || iterations > 1000n) {
            throw new Error('Iterations (N) must be a positive integer between 1 and 1,000.');
        }

        return {
            seed,
            multiplier,
            increment,
            modulus,
            iterations: Number(iterations)
        };
    }

    function generateSequence(params) {
        const { seed, multiplier, increment, modulus, iterations } = params;
        const states = [seed];
        const steps = [];

        for (let index = 0; index < iterations; index += 1) {
            const current = states[index];
            const intermediate = multiplier * current + increment;
            const next = intermediate % modulus;
            steps.push({ index, current, intermediate, next });
            states.push(next);
        }

        return { states, steps };
    }

    function findFirstRepeat(states) {
        const firstSeen = new Map();
        for (let index = 0; index < states.length; index += 1) {
            const state = states[index].toString();
            if (firstSeen.has(state)) {
                const firstIndex = firstSeen.get(state);
                return {
                    repeatedState: states[index],
                    firstIndex,
                    repeatIndex: index,
                    period: index - firstIndex,
                    fullCycle: firstIndex === 0
                };
            }
            firstSeen.set(state, index);
        }
        return null;
    }

    function addStepLine(card, label, text, result = false) {
        const line = document.createElement('div');
        line.className = `step-line${result ? ' step-result' : ''}`;
        const heading = document.createElement('strong');
        heading.textContent = `${label}: `;
        line.append(heading, document.createTextNode(text));
        card.appendChild(line);
    }

    function renderSteps(steps, params) {
        stepContainer.replaceChildren();
        steps.forEach((step, position) => {
            const card = document.createElement('article');
            card.className = `step-card${position === steps.length - 1 ? ' is-current' : ''}`;

            const badge = document.createElement('div');
            badge.className = 'step-badge';
            badge.textContent = `Step ${step.index + 1}`;
            card.appendChild(badge);

            addStepLine(card, 'Formula', `X${step.index + 1} = (a × X${step.index} + c) mod m`);
            addStepLine(card, 'Substitution', `(${params.multiplier} × ${step.current} + ${params.increment}) mod ${params.modulus}`);
            addStepLine(card, 'Intermediate value', `${step.intermediate} mod ${params.modulus}`);
            addStepLine(card, 'Result', `X${step.index + 1} = ${step.next}`, true);
            stepContainer.appendChild(card);
        });
    }

    function renderSequence(states) {
        sequenceDisplay.textContent = states.map(String).join(' → ');
    }

    function renderTable(steps, params) {
        tableBody.replaceChildren();
        steps.forEach((step) => {
            const row = document.createElement('tr');
            const values = [
                String(step.index),
                `X${step.index} = ${step.current}`,
                `(${params.multiplier} × ${step.current} + ${params.increment}) mod ${params.modulus} = ${step.next}`,
                `X${step.index + 1} = ${step.next}`,
                (Number(step.current) / Number(params.modulus)).toFixed(6)
            ];

            values.forEach((value, column) => {
                const cell = document.createElement('td');
                cell.textContent = value;
                if (column === 3) {
                    cell.className = 'next-state';
                }
                row.appendChild(cell);
            });
            tableBody.appendChild(row);
        });
    }

    function createPeriodMetric(label, value) {
        const metric = document.createElement('div');
        metric.className = 'period-metric';
        const title = document.createElement('span');
        title.textContent = label;
        const result = document.createElement('strong');
        result.textContent = value;
        metric.append(title, result);
        return metric;
    }

    function renderPeriod(repeat) {
        periodCard.replaceChildren();
        if (!repeat) {
            periodCard.append(
                createPeriodMetric('Sequence period', 'Not detected'),
                createPeriodMetric('Repeated state', '—')
            );
            const status = document.createElement('div');
            status.className = 'period-status no-repeat';
            status.textContent = 'No repetition detected within the selected iterations.';
            periodCard.appendChild(status);
            return;
        }

        periodCard.append(
            createPeriodMetric('Sequence period', String(repeat.period)),
            createPeriodMetric('Repeated state', `X${repeat.repeatIndex} = X${repeat.firstIndex} = ${repeat.repeatedState}`)
        );
        const status = document.createElement('div');
        status.className = 'period-status';
        status.textContent = repeat.fullCycle
            ? 'Full cycle detected: the sequence has returned to its initial seed.'
            : `A cycle was detected: state X${repeat.repeatIndex} repeats X${repeat.firstIndex}.`;
        periodCard.appendChild(status);
    }

    function renderSummary(params, states, repeat) {
        summaryCard.replaceChildren();
        const period = repeat ? String(repeat.period) : 'No repetition detected';
        const repeated = repeat
            ? `X${repeat.repeatIndex} = X${repeat.firstIndex} = ${repeat.repeatedState}`
            : 'None within selected iterations';
        const values = [
            ['LCG Parameters', `X₀ = ${params.seed}, a = ${params.multiplier}, c = ${params.increment}, m = ${params.modulus}`],
            ['Generated Sequence', states.map(String).join(' → ')],
            ['Period', period],
            ['Repeated State', repeated],
            ['Status', 'Sequence generated successfully']
        ];

        values.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'summary-row';
            const title = document.createElement('span');
            title.textContent = label;
            const result = document.createElement('strong');
            result.textContent = value;
            if (label === 'Generated Sequence') {
                result.classList.add('summary-sequence');
            }
            if (label === 'Status') {
                result.classList.add('summary-status');
            }
            row.append(title, result);
            summaryCard.appendChild(row);
        });
    }

    function drawChart(canvasId, states, modulus, normalized) {
        const canvas = document.getElementById(canvasId);
        const context = canvas.getContext('2d');
        const values = states.map((state) => normalized
            ? Number(state) / Number(modulus)
            : Number(state));
        return new Chart(context, {
            type: 'line',
            data: {
                labels: states.map((_, index) => String(index)),
                datasets: [{
                    label: normalized ? 'Normalized value Uₙ' : 'Generated state Xₙ',
                    data: values,
                    borderColor: normalized ? '#2dd4bf' : '#38bdf8',
                    backgroundColor: normalized ? 'rgba(45, 212, 191, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                    pointBackgroundColor: normalized ? '#2dd4bf' : '#38bdf8',
                    pointRadius: states.length > 50 ? 2 : 4,
                    pointHoverRadius: 6,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.25
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        labels: { color: '#a3b1c6', usePointStyle: true }
                    },
                    tooltip: {
                        callbacks: {
                            title: (items) => `Iteration ${items[0].label}`,
                            label: (item) => normalized
                                ? ` Uₙ = ${item.raw.toFixed(6)}`
                                : ` Xₙ = ${item.raw}`
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Iteration', color: '#a3b1c6' },
                        ticks: { color: '#718096', maxTicksLimit: 12 },
                        grid: { color: 'rgba(255, 255, 255, 0.06)' }
                    },
                    y: {
                        beginAtZero: true,
                        max: normalized ? 1 : Number(modulus),
                        title: {
                            display: true,
                            text: normalized ? 'Normalized value' : 'Generated value',
                            color: '#a3b1c6'
                        },
                        ticks: { color: '#718096' },
                        grid: { color: 'rgba(255, 255, 255, 0.06)' }
                    }
                }
            }
        });
    }

    function renderCharts(states, modulus) {
        if (typeof Chart === 'undefined') {
            chartNotice.hidden = false;
            chartNotice.textContent = 'The chart library could not be loaded. The generated sequence and calculations are still available above.';
            return;
        }
        chartNotice.hidden = true;
        if (valueChart) {
            valueChart.destroy();
        }
        if (normalizedChart) {
            normalizedChart.destroy();
        }
        valueChart = drawChart('lineChart', states, modulus, false);
        normalizedChart = drawChart('normalizedChart', states, modulus, true);
    }

    function runExperiment() {
        validationAlert.hidden = true;
        try {
            const params = validateInputs();
            const { states, steps } = generateSequence(params);
            const repeat = findFirstRepeat(states);
            renderSteps(steps, params);
            renderSequence(states);
            renderTable(steps, params);
            renderPeriod(repeat);
            renderCharts(states, params.modulus);
            renderSummary(params, states, repeat);
        } catch (error) {
            validationAlert.textContent = error.message;
            validationAlert.hidden = false;
        }
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        runExperiment();
    });

    form.addEventListener('reset', () => {
        window.setTimeout(() => {
            validationAlert.hidden = true;
            runExperiment();
        }, 0);
    });

    runExperiment();
});

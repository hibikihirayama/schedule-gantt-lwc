import { LightningElement, track } from 'lwc';
import getGanttData from '@salesforce/apex/ScheduleGanttController.getGanttData';

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 19;
const HOUR_PX = 80;
const TOTAL_HOURS = DAY_END_HOUR - DAY_START_HOUR; // 11
const TOTAL_DAY_PX = TOTAL_HOURS * HOUR_PX;        // 880

function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function todayMidnight() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

export default class ScheduleGantt extends LightningElement {
    @track _viewMode = 'day';
    @track _selectedDate = todayMidnight();
    @track _territories = [];
    @track isLoading = false;
    @track _error = null;

    _rawData = null;

    connectedCallback() {
        this._loadData();
    }

    // --- View state ---

    get isDayView() {
        return this._viewMode === 'day';
    }

    get isWeekView() {
        return this._viewMode === 'week';
    }

    get dayViewClass() {
        return `view-btn${this._viewMode === 'day' ? ' active' : ''}`;
    }

    get weekViewClass() {
        return `view-btn${this._viewMode === 'week' ? ' active' : ''}`;
    }

    // --- Date label ---

    get dateLabel() {
        const d = this._selectedDate;
        if (this._viewMode === 'day') {
            return d.toLocaleDateString('ja-JP', {
                year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
            });
        }
        const end = new Date(d);
        end.setDate(end.getDate() + 6);
        const fmt = (dt) => dt.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
        return `${fmt(d)} – ${fmt(end)}`;
    }

    // --- Resource count ---

    get resourceCount() {
        return this._territories.reduce((sum, t) => sum + t.resources.length, 0);
    }

    // --- Data state ---

    get hasTerritories() {
        return this._territories.length > 0;
    }

    get hasError() {
        return this._error != null;
    }

    get errorMessage() {
        return this._error ? String(this._error) : '';
    }

    // --- Header data ---

    get timeSlots() {
        const slots = [];
        for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
            slots.push({ key: `h${h}`, label: `${h}:00` });
        }
        return slots;
    }

    get weekDays() {
        const today = toDateKey(todayMidnight());
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(this._selectedDate);
            d.setDate(d.getDate() + i);
            const key = toDateKey(d);
            days.push({
                key,
                dayName: d.toLocaleDateString('ja-JP', { weekday: 'short' }),
                dateLabel: d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
                headerClass: `week-day-header${key === today ? ' today' : ''}`
            });
        }
        return days;
    }

    // --- Territory data (consumed by template) ---

    get territories() {
        return this._territories;
    }

    // --- Toolbar handlers ---

    handleDayView() {
        if (this._viewMode !== 'day') {
            this._viewMode = 'day';
            this._reprocessData();
        }
    }

    handleWeekView() {
        if (this._viewMode !== 'week') {
            this._viewMode = 'week';
            this._loadData();
        }
    }

    handleToday() {
        this._selectedDate = todayMidnight();
        this._loadData();
    }

    handlePrev() {
        const d = new Date(this._selectedDate);
        d.setDate(d.getDate() - (this._viewMode === 'day' ? 1 : 7));
        this._selectedDate = d;
        this._loadData();
    }

    handleNext() {
        const d = new Date(this._selectedDate);
        d.setDate(d.getDate() + (this._viewMode === 'day' ? 1 : 7));
        this._selectedDate = d;
        this._loadData();
    }

    handleRefresh() {
        this._loadData();
    }

    // --- Data loading ---

    async _loadData() {
        this.isLoading = true;
        this._error = null;

        const startDt = new Date(this._selectedDate);
        startDt.setHours(0, 0, 0, 0);

        const endDt = new Date(this._selectedDate);
        if (this._viewMode === 'week') {
            endDt.setDate(endDt.getDate() + 6);
        }
        endDt.setHours(23, 59, 59, 999);

        try {
            const data = await getGanttData({
                startIso: startDt.toISOString(),
                endIso: endDt.toISOString()
            });
            this._rawData = data;
            this._reprocessData();
        } catch (err) {
            this._error = err.body ? err.body.message : (err.message || String(err));
        } finally {
            this.isLoading = false;
        }
    }

    _reprocessData() {
        if (!this._rawData) return;
        this._territories = this._rawData.territories.map(territory => ({
            ...territory,
            resources: territory.resources.map(resource => this._processResource(resource))
        }));
    }

    _processResource(resource) {
        if (this._viewMode === 'day') {
            return {
                ...resource,
                dayBlocks: (resource.appointments || [])
                    .map(apt => this._computeDayBlock(apt))
                    .filter(Boolean)
            };
        }
        return {
            ...resource,
            dayCells: this._computeWeekCells(resource.appointments || [])
        };
    }

    _computeDayBlock(apt) {
        const dayStart = new Date(this._selectedDate);
        dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
        const dayEnd = new Date(this._selectedDate);
        dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);

        const saStart = new Date(apt.schedStartTime);
        const saEnd = new Date(apt.schedEndTime);

        const visStart = Math.max(saStart.getTime(), dayStart.getTime());
        const visEnd = Math.min(saEnd.getTime(), dayEnd.getTime());

        if (visEnd <= visStart) return null;

        const totalMs = TOTAL_HOURS * 3600000;
        const leftPx = ((visStart - dayStart.getTime()) / totalMs) * TOTAL_DAY_PX;
        const widthPx = Math.max(((visEnd - visStart) / totalMs) * TOTAL_DAY_PX, 4);

        const fmt = (dt) => dt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        const label = apt.subject
            ? `${apt.appointmentNumber} ${apt.subject}`
            : apt.appointmentNumber;

        return {
            id: apt.id,
            style: `left:${leftPx.toFixed(1)}px;width:${widthPx.toFixed(1)}px`,
            label,
            tooltip: `${apt.appointmentNumber}${apt.subject ? '\n' + apt.subject : ''}\n${fmt(saStart)}–${fmt(saEnd)}`
        };
    }

    _computeWeekCells(appointments) {
        return this.weekDays.map(day => {
            const dayApts = appointments
                .filter(apt => toDateKey(new Date(apt.schedStartTime)) === day.key)
                .map(apt => ({
                    id: apt.id,
                    label: apt.subject
                        ? `${apt.appointmentNumber} ${apt.subject}`
                        : apt.appointmentNumber,
                    tooltip: apt.subject || apt.appointmentNumber
                }));
            return { dayKey: day.key, appointments: dayApts };
        });
    }
}
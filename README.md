# schedule-gantt-lwc

A read-only Lightning Web Component that visualizes `ServiceAppointment` assignments across `ServiceResource`s, grouped by `ServiceTerritory`, in a Gantt-style time matrix — Day and Week views, hourly time axis, prev/next/today navigation, and a manual refresh action.

## Contents

- `force-app/main/default/lwc/scheduleGantt` — the LWC bundle (exposed on `lightning__AppPage`, `lightning__RecordPage`, `lightning__HomePage`)
- `force-app/main/default/classes/ScheduleGanttController.cls` — Apex controller (`getGanttData`) that queries `ServiceTerritoryMember`, `ServiceResource`, `AssignedResource`, and `ServiceAppointment`

## Deploy

```bash
sf project deploy start --source-dir force-app
```

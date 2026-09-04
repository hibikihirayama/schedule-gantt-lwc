public with sharing class ScheduleGanttController {

    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getGanttData(String startIso, String endIso) {
        try {
            Datetime startDt = (Datetime) JSON.deserialize('"' + startIso + '"', Datetime.class);
            Datetime endDt   = (Datetime) JSON.deserialize('"' + endIso   + '"', Datetime.class);
            Date startDate = startDt.date();
            Date endDate   = endDt.date();

            List<ServiceTerritoryMember> members = [
                SELECT ServiceResourceId, ServiceResource.Name, ServiceResource.ResourceType,
                       ServiceTerritoryId, ServiceTerritory.Name
                FROM   ServiceTerritoryMember
                WHERE  ServiceTerritory.IsActive = true
                AND    EffectiveStartDate <= :endDate
                AND    (EffectiveEndDate = null OR EffectiveEndDate >= :startDate)
                ORDER BY ServiceTerritory.Name, ServiceResource.Name
            ];

            Set<Id> resourceIds = new Set<Id>();
            for (ServiceTerritoryMember m : members) {
                resourceIds.add(m.ServiceResourceId);
            }

            List<AssignedResource> assignments = new List<AssignedResource>();
            if (!resourceIds.isEmpty()) {
                assignments = [
                    SELECT ServiceResourceId,
                           ServiceAppointment.Id,
                           ServiceAppointment.AppointmentNumber,
                           ServiceAppointment.Subject,
                           ServiceAppointment.SchedStartTime,
                           ServiceAppointment.SchedEndTime,
                           ServiceAppointment.Status
                    FROM   AssignedResource
                    WHERE  ServiceResourceId IN :resourceIds
                    AND    ServiceAppointment.SchedStartTime < :endDt
                    AND    ServiceAppointment.SchedEndTime   > :startDt
                    AND    ServiceAppointment.Status        != 'Canceled'
                ];
            }

            Map<Id, List<Map<String, Object>>> aptsByResource = new Map<Id, List<Map<String, Object>>>();
            Set<String> seenSaKeys = new Set<String>();
            for (AssignedResource ar : assignments) {
                String key = ar.ServiceResourceId + '_' + ar.ServiceAppointment.Id;
                if (seenSaKeys.contains(key)) continue;
                seenSaKeys.add(key);
                if (!aptsByResource.containsKey(ar.ServiceResourceId)) {
                    aptsByResource.put(ar.ServiceResourceId, new List<Map<String, Object>>());
                }
                aptsByResource.get(ar.ServiceResourceId).add(new Map<String, Object>{
                    'id'                => (String) ar.ServiceAppointment.Id,
                    'appointmentNumber' => ar.ServiceAppointment.AppointmentNumber,
                    'subject'           => ar.ServiceAppointment.Subject,
                    'schedStartTime'    => ar.ServiceAppointment.SchedStartTime,
                    'schedEndTime'      => ar.ServiceAppointment.SchedEndTime,
                    'status'            => ar.ServiceAppointment.Status
                });
            }

            Map<Id, Map<String, Object>> territoryMap = new Map<Id, Map<String, Object>>();
            Map<Id, Set<Id>> seenResPerTerritory = new Map<Id, Set<Id>>();
            List<Id> territoryOrder = new List<Id>();

            for (ServiceTerritoryMember m : members) {
                Id tId = m.ServiceTerritoryId;
                if (!territoryMap.containsKey(tId)) {
                    territoryMap.put(tId, new Map<String, Object>{
                        'id'        => (String) tId,
                        'name'      => m.ServiceTerritory.Name,
                        'resources' => new List<Map<String, Object>>()
                    });
                    seenResPerTerritory.put(tId, new Set<Id>());
                    territoryOrder.add(tId);
                }
                if (!seenResPerTerritory.get(tId).contains(m.ServiceResourceId)) {
                    seenResPerTerritory.get(tId).add(m.ServiceResourceId);
                    List<Map<String, Object>> resources =
                        (List<Map<String, Object>>) territoryMap.get(tId).get('resources');
                    resources.add(new Map<String, Object>{
                        'resourceId'   => (String) m.ServiceResourceId,
                        'name'         => m.ServiceResource.Name,
                        'resourceType' => m.ServiceResource.ResourceType,
                        'appointments' => aptsByResource.containsKey(m.ServiceResourceId)
                            ? aptsByResource.get(m.ServiceResourceId)
                            : new List<Map<String, Object>>()
                    });
                }
            }

            List<Map<String, Object>> territories = new List<Map<String, Object>>();
            for (Id tId : territoryOrder) {
                territories.add(territoryMap.get(tId));
            }

            return new Map<String, Object>{ 'territories' => territories };
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}
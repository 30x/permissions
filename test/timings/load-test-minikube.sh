export scheme=http
export host="sso.k8s.dev"
export port=30556

export numberOfUsers=1000
export numberOfOrgs=2
export meanNumberOfDevelopersPerOrg=8
export meanNumberOfAppsPerOrg=5
export deviationsOfDevelopersPerOrg=1.5
export deviationsOfAppsPerOrg=1.5
export numberOfIsAllowedCallsPerApp=1000
export routing_api_key="cHJpdmF0ZS1zZWNyZXQ="

node load-test.js
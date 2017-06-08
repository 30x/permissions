exports.orgPermission = function(org, orgURL, user){
  return {
    _subject: orgURL,
    _self: {
      read: [user],
      update: [user],
      put: [user],
      delete: [user],
      admin: [user],
      govern: [user]
    },
    _permissionsHeirs:{
      add: [user],
      read: [user],
      remove: [user]
    },
    subscriptions: {
      read: [],
      create: [],
      update: [],
      delete: []
    },
    events: {
      read: [],
      create: [],
      update: [],
      delete: []
    },
    notifications: {
      read: [],
      create: [],
      update: [],
      delete: []
    },
    history: {
      read: [],
      delete: []
    },
    templates: {
      read: [],
      create: [],
      update: [],
      delete: []
    }
  }
}

exports.envPermission = function(baseLocation, org) {
  return {
    _subject: baseLocation + 'v1/o/' + org + '/environments',
    _inheritsPermissionsOf: '/o/' + org,
    _self: {
      read: [],
      update: [],
      delete: [],
      admin: [],
      govern: []
    },
    _permissionsHeirs: {
      add: [],
      read: [],
      remove: []
    }
  }
}

exports.shipyardEnvPermission = function(baseLocation, org) {
  return {
    _subject: baseLocation + 'v1/o/' + org + '/shipyardEnvironments',
    _inheritsPermissionsOf: '/o/' + org,
    _self: {
      read: [],
      update: [],
      delete: [],
      admin: [],
      govern: []
    },
    _permissionsHeirs: {
      add: [],
      read: [],
      remove: []
    }
  }
}

//TODO finish this
exports.stdPermission = function(subject, inherits){
  return {
    _resource: {
      _self: "/o/usergrid-e2e/environments/test",
      inheritsPermissionsFrom: "/o/usergrid-e2e/environments"
    },
    _permissions: {
      _self: "/az-permissions?/o/usergrid-e2e/environments/test"
    }
  }
}

exports.team = function(orgName, orgURL, teamName, members) {
  return {
    isA: 'Team',
    name: orgName + ' '+teamName,
    _permissions: {_inheritsPermissionsOf: [orgURL]},
    members: members,
  }
}

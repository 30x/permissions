import requests
import psycopg2
import base64
import json

try:
    conn = psycopg2.connect("dbname='permissions' user='martinnally' host='localhost' password='martinnally'")
except:
    print 'I am unable to connect to the database'

with conn:
    with conn.cursor() as cur:
        cur.execute('DROP TABLE IF EXISTS permissions')
        cur.execute('DROP TABLE IF EXISTS teams')
        cur.execute('CREATE TABLE permissions (subject text primary key, etag int, data jsonb)')
        cur.execute('CREATE TABLE teams (id text primary key, etag int, data jsonb)')

def b64_decode(data):
    missing_padding = (4 - len(data) % 4) % 4
    if missing_padding:
        data += b'='* missing_padding
    return base64.decodestring(data)

with open('token.txt') as f:
    TOKEN1 = f.read()
    USER1 = json.loads(b64_decode(TOKEN1.split('.')[1]))['user_id']

with open('token2.txt') as f:
    TOKEN2 = f.read()
    USER2 = json.loads(b64_decode(TOKEN1.split('.')[1]))['user_id']

def main():
    
    # Create permissions for Acme org (fail)

    permissions = {
    'isA': 'Permissions',
    'governs': 
        {'self': 'http://apigee.com/o/acme',
        'updaters': [USER1],
        'readers': [USER1],
        'deleters': [USER1],
        'creators': [USER1]
        },
    'readers': [USER1],
    'deleters': [USER1],
    'updaters': [USER1]     
    }
    permissions_url = 'http://localhost:8080' + '/az-permissions' 
    headers = {'Accept': 'application/json'}
    r = requests.post(permissions_url, headers=headers, json=permissions)
    if r.status_code == 403:
        print 'correctly rejected permissions creation without user' 
    else:
        print 'failed to create permissions %s %s' % (r.status_code, r.text)
    
    # Create permissions for Acme org (succeed)

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.post(permissions_url, headers=headers, json=permissions)
    if r.status_code == 201:
        print 'correctly created permissions'
        org_permissions = r.headers['Location'] 
    else:
        print 'failed to create permissions %s %s' % (r.status_code, r.text)
        return
    
    # Retrieve permissions for Acme org

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get(org_permissions, headers=headers, json=permissions)
    if r.status_code == 200:
        server_permission = r.json()
        if all(item in server_permission.items() for item in permissions.items()):
            if ('Etag' in r.headers):
                acme_org_if_match = r.headers['Etag']
                print 'correctly retrieved permissions'
            else:
                print 'failed to provide etag in create response'
        else:
            print 'retrieved permissions but comparison failed'
    else:
        print 'failed to create permissions %s %s' % (r.status_code, r.text)
    
    # Create permissions for Acme teams (succeed)

    permissions = {
    'isA': 'Permissions',
    '_self': 
        {'self': 'http://apigee.com/o/acme/teams',
        'inheritsPermissionsOf': ['http://apigee.com/o/acme']
        }
    }

    headers = {'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'BEARER %s' % TOKEN1}
    r = requests.post(permissions_url, headers=headers, json=permissions)
    if r.status_code == 201:
        print 'correctly accepted permission with no updater from logged-in user' 
    else:
        print 'incorrectly rejected permission with no updater from logged-in user %s %s' % (r.status_code, r.text)
    
    # Read permissions for Acme teams (fail)

    team_permissions = r.headers['Location']
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    r = requests.get(team_permissions, headers=headers, json=permissions)
    if r.status_code == 403:
        print 'correctly rejected read of permission with no user' 
    else:
        print 'incorrectly accepted read of permission with no user %s %s' % (r.status_code, r.text)
    
    # Read heirs of Acme org (succeed)

    url = 'http://localhost:8080' + '/az-permissions-heirs?%s' % 'http://apigee.com/o/acme'
    headers = {'Accept': 'application/json', 'Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        heirs = r.json()
        if [perm['self'] for perm in heirs] == ['http://apigee.com/o/acme/teams']:
            print 'correctly returned permissions heirs of http://apigee.com/o/acme'
        else:
            print 'incorrect resources permissions heirs of http://apigee.com/o/acme %s' % heirs
    else:
        print 'failed to return permissions heirs of http://apigee.com/o/acme %s %s' % (r.status_code, r.text)
    
    # Read heirs of Acme org (fail)

    url = 'http://localhost:8080' + '/az-permissions-heirs?%s' % 'http://apigee.com/o/acme'
    headers = {'Accept': 'application/json', 'Authorization': 'BEARER %s' % TOKEN2}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 403:
        print 'correctly refused to return sharing set heirs to unauthorized user'
    else:
        print 'failed to refuse to return sharing set heirs to unauthorized user %s' % r.status_code
    
    # Create Org Admins team

    team = {
        'isA': 'Team',
        'name': 'Org admins',
        '_permissions': {'_inheritsPermissionsOf': ['http://apigee.com/o/acme/teams']},
        'members': [USER1] 
        }
    url = 'http://localhost:8080' + '/az-teams' 
    headers = {'Accept': 'application/json', 'Authorization': 'BEARER %s' % TOKEN1}
    r = requests.post(url, headers=headers, json=team)
    if r.status_code == 201:
        print 'correctly created team'
        TEAM1 = r.headers['location']
    else:
        print 'failed to create team %s %s - cannot continue' % (r.status_code, r.text)
    
    # Get Org Admins Team Resource list
    
    url = 'http://localhost:8080' + '/az-resources-accessible-by-team-members?' + TEAM1 
    headers = {'Accept': 'application/json', 'Authorization': 'BEARER %s' % TOKEN1}
    r = requests.post(url, headers=headers, json=team)
    if r.status_code == 200:
        print 'correctly retrieved team resources'
    else:
        print 'failed to retrieve team resources %s %s - cannot continue' % (r.status_code, r.text)

    # Patch Acme org permissions to use team

    permissions_patch = {
    'governs': 
        {'self': 'http://apigee.com/o/acme',
        'updaters': [TEAM1],
        'readers': [TEAM1],
        'deleters': [TEAM1],
        'creators': [TEAM1]
        },
    'readers': [TEAM1],
    'deleters': [TEAM1],
    'updaters': [TEAM1]     
    }

    headers = {'Content-Type': 'application/json', 'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.patch(org_permissions, headers=headers, json=permissions_patch)
    if r.status_code == 400:
        print 'correctly refused to patch permissions without If-Match header' 
    else:
        print 'failed to patch permissions %s %s' % (r.status_code, r.text)
    
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1, 'If-Match': acme_org_if_match}
    r = requests.patch(org_permissions, headers=headers, json=permissions_patch)
    if r.status_code == 200:
        print 'correctly patched permissions' 
    else:
        print 'failed to patch permissions %s %s' % (r.status_code, r.text)
    
    # Retrieve Acme org permissions

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get(org_permissions, headers=headers, json=permissions)
    if r.status_code == 200:
        server_permission = r.json()
        if all(item in server_permission.items() for item in permissions_patch.items()):
            print 'correctly retrieved permissions'
        else:
            print 'retrieved permissions but comparison failed %s' % r.text
    else:
        print 'failed to retrieve permissions %s %s' % (r.status_code, r.text)
    
    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get(team_permissions, headers=headers, json=permissions)
    if r.status_code == 200:
        server_permission = r.json()
        print 'correctly retrieved permissions'
    else:
        print 'failed to retrieve permissions %s %s' % (r.status_code, r.text)
    
    # Retrieve Acme org heirs

    url = 'http://localhost:8080' + '/az-permissions-heirs?%s' % 'http://apigee.com/o/acme'
    headers = {'Accept': 'application/json', 'Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        heirs = r.json()
        if [perm['self'] for perm in heirs] == ['http://apigee.com/o/acme/teams']:
            print 'correctly returned heirs of http://apigee.com/o/acme after update of permissions to use team'
        else:
            print 'incorrect heirs of http://apigee.com/o/acme %s' % heirs
    else:
        print 'failed to return heirs of http://apigee.com/o/acme %s %s' % (r.status_code, r.text)

if __name__ == '__main__':
    main()
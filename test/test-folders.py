import requests
import base64
import json
from os import environ as env
from urlparse import urljoin

EXTERNAL_SCHEME = env['EXTERNAL_SCHEME']
BASE_URL = '%s://%s:%s' % (EXTERNAL_SCHEME, env['EXTERNAL_SY_ROUTER_HOST'], env['EXTERNAL_SY_ROUTER_PORT']) if 'EXTERNAL_SY_ROUTER_PORT' in env else '%s://%s' % (EXTERNAL_SCHEME, env['EXTERNAL_SY_ROUTER_HOST'])

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
    
    folder1 = {
        'isA': 'Folder',
        'test-data': True     
        }
    folders_url = 'http://localhost:8080/folders' 
    headers = {'Accept': 'application/json'}
    r = requests.post(folders_url, headers=headers, json=folder1)
    if r.status_code == 403:
        print 'correctly rejected folder create creation without user' 
    else:
        print 'failed to create folder %s %s' % (r.status_code, r.text)

    # Create folder
    
    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.post(folders_url, headers=headers, json=folder1)
    if r.status_code == 201:
        print 'correctly created permissions'
        folder1_rel_url = r.headers['Location']
        folder1_url = urljoin(BASE_URL, folder1_rel_url)
    else:
        print 'failed to create folder %s %s' % (r.status_code, r.text)
        return
    
    # Retrieve permissions for Acme org

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get('http://localhost:8080/permissions?%s' %folder1_rel_url, headers=headers)
    if r.status_code == 200:
        server_folder1_permissions = r.json()
        if ('Etag' in r.headers):
            folder1_permissions_if_match = r.headers['Etag']
            print 'correctly retrieved folder permissions'
            print json.dumps(server_folder1_permissions, indent = 4)
            print 'etag: %s' % folder1_permissions_if_match
        else:
            print 'failed to find etag in get response'
    else:
        print 'failed to get folder %s %s' % (r.status_code, r.text)
    
    # Retrieve permissions for Acme org

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get(folder1_url, headers=headers)
    if r.status_code == 200:
        server_folder1 = r.json()
        if all(item in server_folder1.items() for item in folder1.items()):
            if ('Etag' in r.headers):
                folder1_if_match = r.headers['Etag']
                print 'correctly retrieved folder '
                print json.dumps(server_folder1, indent = 4)
                print 'etag: %s' % folder1_if_match
            else:
                print 'failed to find etag in get response'
        else:
            print 'retrieved folder1 but comparison failed'
    else:
        print 'failed to get folder %s %s' % (r.status_code, r.text)
    
    # Retrieve permissions for Acme org

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.delete(folder1_url, headers=headers)
    if r.status_code == 200:
        server_folder1 = r.json()
        if all(item in server_folder1.items() for item in folder1.items()):
            if ('Etag' in r.headers):
                folder1_if_match = r.headers['Etag']
                print 'correctly deleted folder '
                print json.dumps(server_folder1, indent = 4)
                print 'etag: %s' % folder1_if_match
            else:
                print 'failed to find etag in delete response'
        else:
            print 'deleted folder1 but comparison failed'
    else:
        print 'failed to delete folder %s %s' % (r.status_code, r.text)

    # Retrieve permissions for Acme org

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get('http://localhost:8080/permissions?%s' %folder1_rel_url, headers=headers)
    if r.status_code == 404:
        print 'folder permissions correctly deleted'
    else:
        print 'failed to fail to get folder permissions %s %s' % (r.status_code, r.text)
    
if __name__ == '__main__':
    main()
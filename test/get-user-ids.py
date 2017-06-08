import base64
import json
from os import environ as env

def b64_decode(data):
    missing_padding = (4 - len(data) % 4) % 4
    if missing_padding:
        data += b'='* missing_padding
    return base64.decodestring(data)

if 'APIGEE_TOKEN1' in env:
    TOKEN1 = env['APIGEE_TOKEN1']
else:
    with open('token.txt') as f:
        TOKEN1 = f.read()
USER1_CLAIMS = json.loads(b64_decode(TOKEN1.split('.')[1]))      
USER1 = '%s#%s' % (USER1_CLAIMS['iss'], USER1_CLAIMS['sub'])
USER1_E = USER1.replace('#', '%23')

if 'APIGEE_TOKEN2' in env:
    TOKEN2 = env['APIGEE_TOKEN2']
else:
    with open('token2.txt') as f:
        TOKEN2 = f.read()
USER2_CLAIMS = json.loads(b64_decode(TOKEN2.split('.')[1]))      
USER2 = '%s#%s' % (USER2_CLAIMS['iss'], USER2_CLAIMS['sub'])
USER2_E = USER2.replace('#', '%23')
API_KEY = env.get('API_KEY')

if 'APIGEE_TOKEN3' in env:
    TOKEN3 = env['APIGEE_TOKEN3']
else:
    with open('token3.txt') as f:
        TOKEN3 = f.read()
USER3_CLAIMS = json.loads(b64_decode(TOKEN3.split('.')[1]))      
USER3 = '%s#%s' % (USER3_CLAIMS['iss'], USER3_CLAIMS['sub'])
USER3_E = USER3.replace('#', '%23')

print json.dumps([x.split('#')[1] for x in [USER1, USER2, USER3]])

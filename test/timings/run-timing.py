import requests
import timeit
import sys

port = sys.argv[1]
def send_request():
    r = requests.get('http://localhost:%s/timing' % port)
    if r.status_code != 200:
        print 'failed to hit timing %s' % r.status_code
        return

def main():        
    # print timeit.timeit('send_request()', setup="from __main__ import send_request", number=1000)
    send_request()
    number = int(sys.argv[2])
    max = 0
    for it in xrange(number):
        start = timeit.default_timer()
        send_request()
        diff = timeit.default_timer() - start
        if diff > max:
            max = diff
        print 'iteration', it, 'diff', diff * 1000
    print 'max', max * 1000
    
if __name__ == '__main__':
    main()
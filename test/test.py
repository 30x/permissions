import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)                 
s.connect(("localhost" , 3001))
s.sendall("POST http://localhost:3001/foo/bar HTTP/1.1\nHost: localhost:3001\n\n")
print s.recv(4096)
s.close()
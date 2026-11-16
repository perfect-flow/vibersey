import sys
from PIL import Image
d=sys.argv[1]; names=sys.argv[2:]
ims=[Image.open(f"{d}/{n}.png") for n in names]
w,h=ims[0].size
g=Image.new('RGB',(w*2,h*((len(ims)+1)//2)),'white')
for i,im in enumerate(ims): g.paste(im,((i%2)*w,(i//2)*h))
g.save(f"{d}/grid.png")

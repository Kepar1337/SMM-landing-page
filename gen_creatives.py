#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate FB/IG ad creatives for «ЧИТ-КОД для SMM».
3 angles × 2 formats (4:5 feed 1080×1350, 9:16 story 1080×1920)."""

import os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = "/sessions/busy-clever-johnson/mnt/Smm page/creatives"
os.makedirs(OUT, exist_ok=True)

FD = "/sessions/busy-clever-johnson/mnt/.claude/skills/canvas-design/canvas-fonts"
F_HEAVY = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
F_REG   = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
F_BOLD  = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
F_ITAL  = "/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf"
F_DISP  = f"{FD}/ArsenalSC-Regular.ttf"

def font(p, s): return ImageFont.truetype(p, s)

CREAM=(247,241,236); SAND=(239,230,222); BLUSH=(251,238,241)
ROSE=(217,134,159); ROSEDP=(194,107,134); INK=(52,48,46)
GRAPH=(90,82,77); MUTED=(147,138,131); FOLDER=(231,166,188)
SILVER=(199,203,208); LINE=(231,220,211); WHITE=(255,255,255)

def vgradient(w,h,top,bottom):
    grad=Image.new("RGB",(1,h))
    for y in range(h):
        t=y/max(1,h-1)
        grad.putpixel((0,y),tuple(int(top[i]+(bottom[i]-top[i])*t) for i in range(3)))
    return grad.resize((w,h))

def radial_glow(img,cx,cy,radius,color,strength=0.55):
    w,h=img.size
    glow=Image.new("RGB",(w,h),color)
    mask=Image.new("L",(w,h),0); md=ImageDraw.Draw(mask)
    steps=60
    for i in range(steps,0,-1):
        r=radius*i/steps; a=int(255*strength*(1-i/steps)**1.4)
        md.ellipse([cx-r,cy-r,cx+r,cy+r],fill=a)
    img.paste(glow,(0,0),mask); return img

def rounded(draw,box,r,fill=None,outline=None,width=1):
    draw.rounded_rectangle(box,radius=r,fill=fill,outline=outline,width=width)

def card(img,box,r=36,fill=WHITE,shadow=True,shadow_blur=34,shadow_alpha=46,dy=18):
    if shadow:
        x0,y0,x1,y1=box
        sh=Image.new("RGBA",img.size,(0,0,0,0)); sd=ImageDraw.Draw(sh)
        sd.rounded_rectangle([x0,y0+dy,x1,y1+dy],radius=r,fill=(120,90,95,shadow_alpha))
        sh=sh.filter(ImageFilter.GaussianBlur(shadow_blur)); img.paste(sh,(0,0),sh)
    d=ImageDraw.Draw(img); rounded(d,box,r,fill=fill); return d

def star(draw,cx,cy,R,color,rot=0):
    pts=[]; inner=R*0.34
    for i in range(8):
        ang=math.radians(rot+i*45); rad=R if i%2==0 else inner
        pts.append((cx+rad*math.sin(ang),cy-rad*math.cos(ang)))
    draw.polygon(pts,fill=color)

def star5(draw,cx,cy,R,color):
    pts=[]
    for i in range(10):
        ang=math.radians(-90+i*36); rad=R if i%2==0 else R*0.42
        pts.append((cx+rad*math.cos(ang),cy+rad*math.sin(ang)))
    draw.polygon(pts,fill=color)

def draw_stars(draw,x,y,R,n=5,gap=None,color=ROSE):
    gap=gap or R*2.5
    for i in range(n): star5(draw,x+R+i*gap,y+R,R,color)

def folder(draw,x,y,w,color=FOLDER):
    h=int(w*0.74); tab_h=int(h*0.22)
    draw.rounded_rectangle([x,y+tab_h-6,x+w,y+h],radius=int(w*0.10),fill=color)
    draw.rounded_rectangle([x,y,x+int(w*0.46),y+tab_h+10],radius=int(w*0.08),fill=color)
    lighter=tuple(min(255,int(c+18)) for c in color)
    draw.rounded_rectangle([x,y+int(tab_h*0.9),x+w,y+h],radius=int(w*0.10),fill=lighter)

def text_w(draw,s,fnt,tracking=0):
    if tracking==0: return draw.textlength(s,font=fnt)
    return sum(draw.textlength(ch,font=fnt)+tracking for ch in s)-tracking

def draw_tracked(draw,xy,s,fnt,fill,tracking=0,anchor_center=None):
    x,y=xy
    if anchor_center is not None:
        x=anchor_center-text_w(draw,s,fnt,tracking)/2
    for ch in s:
        draw.text((x,y),ch,font=fnt,fill=fill); x+=draw.textlength(ch,font=fnt)+tracking

def wrap(draw,s,fnt,max_w):
    words=s.split(); lines=[]; cur=""
    for wd in words:
        test=(cur+" "+wd).strip()
        if draw.textlength(test,font=fnt)<=max_w: cur=test
        else:
            if cur: lines.append(cur)
            cur=wd
    if cur: lines.append(cur)
    return lines

def draw_wrapped(draw,xy,s,fnt,fill,max_w,lh,center_x=None):
    lines=wrap(draw,s,fnt,max_w); x,y=xy
    for ln in lines:
        if center_x is not None:
            w=draw.textlength(ln,font=fnt); draw.text((center_x-w/2,y),ln,font=fnt,fill=fill)
        else: draw.text((x,y),ln,font=fnt,fill=fill)
        y+=lh
    return y

def pill(img,cx,y,w,h,text,fnt,bg=ROSE,fg=WHITE,lock=True):
    d=ImageDraw.Draw(img); x0=cx-w/2; box=[x0,y,x0+w,y+h]
    sh=Image.new("RGBA",img.size,(0,0,0,0)); sd=ImageDraw.Draw(sh)
    sd.rounded_rectangle([box[0],box[1]+12,box[2],box[3]+12],radius=h/2,fill=(194,107,134,120))
    sh=sh.filter(ImageFilter.GaussianBlur(18)); img.paste(sh,(0,0),sh)
    d.rounded_rectangle(box,radius=h/2,fill=bg)
    tw=d.textlength(text,font=fnt); icon_w=int(h*0.42)+18 if lock else 0
    start=cx-(tw+icon_w)/2
    if lock:
        lx=start; ly=y+h*0.30; s=int(h*0.40)
        d.rounded_rectangle([lx,ly+s*0.42,lx+s,ly+s],radius=6,fill=fg)
        d.arc([lx+s*0.16,ly,lx+s*0.84,ly+s*0.7],180,360,fill=fg,width=max(3,int(s*0.14)))
        start+=icon_w
    d.text((start,y+h/2-fnt.size*0.62),text,font=fnt,fill=fg)

def eyebrow(draw,cx,y,text,fnt):
    tw=text_w(draw,text,fnt,4); pad=26; w=tw+pad*2; h=fnt.size+22
    draw.rounded_rectangle([cx-w/2,y,cx+w/2,y+h],radius=h/2,fill=(217,134,159,38))
    draw_tracked(draw,(0,y+11),text,fnt,ROSEDP,tracking=4,anchor_center=cx)
    return y+h

def cross(draw,x,y,s,color=ROSEDP):
    draw.line([(x,y),(x+s,y+s)],fill=color,width=max(5,int(s*0.16)))
    draw.line([(x+s,y),(x,y+s)],fill=color,width=max(5,int(s*0.16)))

def logo_strip(draw,cx,y,size=40):
    f=font(F_HEAVY,size); a="ЧИТ-КОД "; b="SMM"
    wa=draw.textlength(a,font=f); wb=draw.textlength(b,font=f); x=cx-(wa+wb)/2
    draw.text((x,y),a,font=f,fill=INK); draw.text((x+wa,y),b,font=f,fill=ROSE)

def sticky_note(img,x,y,w,h,lines,fnt,angle=-5,fill=BLUSH,fg=ROSEDP):
    note=Image.new("RGBA",(w+80,h+80),(0,0,0,0)); nd=ImageDraw.Draw(note)
    nd.rounded_rectangle([40,40,40+w,40+h],radius=22,fill=fill)
    ty=40+30
    for ln in lines:
        lw=nd.textlength(ln,font=fnt); nd.text(((note.width-lw)/2,ty),ln,font=fnt,fill=fg); ty+=fnt.size+12
    note=note.rotate(angle,expand=True,resample=Image.BICUBIC)
    sh=note.split()[3].filter(ImageFilter.GaussianBlur(16))
    shimg=Image.new("RGBA",note.size,(90,60,60,70)); img.paste(shimg,(x-30,y-20),sh)
    img.paste(note,(x-40,y-40),note)

def canvas(fmt):
    W,H=(1080,1350) if fmt=="feed" else (1080,1920)
    img=vgradient(W,H,CREAM,(243,233,236))
    radial_glow(img,int(W*0.82),int(H*0.06),int(W*0.9),BLUSH,0.6)
    radial_glow(img,int(W*0.04),int(H*0.30),int(W*0.7),SAND,0.5)
    return img,W,H

def variant1(fmt):
    img,W,H=canvas(fmt); d=ImageDraw.Draw(img); cx=W//2
    top=150 if fmt=="story" else 90
    star(d,W-150,top+40,46,SILVER,12); star(d,120,H-(360 if fmt=="story" else 250),30,FOLDER,20)
    y=top; y=eyebrow(d,cx,y,"ЧЕСНО ПРО SMM",font(F_DISP,34))+36
    head=font(F_HEAVY,92 if fmt=="story" else 86)
    for ln in ["ХАОС У SMM","КОШТУЄ ТОБІ","КЛІЄНТІВ"]:
        col=ROSE if ln=="КЛІЄНТІВ" else INK
        lw=d.textlength(ln,font=head); d.text((cx-lw/2,y),ln,font=head,fill=col); y+=head.size+4
    y+=24
    y=draw_wrapped(d,(0,y),"Поки знання зібрані по шматках — час і гроші витікають щодня.",font(F_REG,38),GRAPH,int(W*0.82),50,center_x=cx)+30
    cw=int(W*0.80); ch=360 if fmt=="story" else 330; cx0=cx-cw/2
    card(img,[cx0,y,cx0+cw,y+ch],r=34,fill=WHITE); d=ImageDraw.Draw(img)
    items=["48 збережених рілсів — без дії","15 відкритих вкладок — без системи","3 куплені курси — без результату","купа нотаток — і знову хаос"]
    iy=y+44; lf=font(F_BOLD,34)
    for it in items:
        cross(d,cx0+40,iy+4,30); d.text((cx0+100,iy),it,font=lf,fill=GRAPH); iy+=72
    y+=ch+(64 if fmt=="story" else 54)
    sticky_note(img,int(cx-300),y,600,148,["Проблема не в тобі.","Проблема — у відсутності системи."],font(F_BOLD,32),angle=-3)
    y+=210 if fmt=="story" else 182
    pill(img,cx,y,int(W*0.74),116,"Відкрити доступ",font(F_BOLD,42))
    d=ImageDraw.Draw(img); logo_strip(d,cx,y+150,38)
    img.convert("RGB").save(f"{OUT}/v1_pain_{fmt}.png",quality=95); print("saved v1",fmt)

def variant2(fmt):
    img,W,H=canvas(fmt); d=ImageDraw.Draw(img); cx=W//2
    top=150 if fmt=="story" else 90
    star(d,130,top+30,40,SILVER,10); star(d,W-140,H-(420 if fmt=="story" else 300),34,FOLDER,18)
    y=top; y=eyebrow(d,cx,y,"МІНІ-ПРОДУКТ",font(F_DISP,34))+30
    head=font(F_HEAVY,118 if fmt=="story" else 104)
    for ln,col in [("ЧИТ-КОД",INK),("ДЛЯ SMM",ROSE)]:
        lw=d.textlength(ln,font=head); d.text((cx-lw/2,y),ln,font=head,fill=col); y+=head.size+2
    y+=22
    y=draw_wrapped(d,(0,y),"Менше хаосу — більше результату",font(F_BOLD,40),GRAPH,int(W*0.85),52,center_x=cx)+10
    y=draw_wrapped(d,(0,y),"Твій робочий набір для старту, впевненості та росту.",font(F_REG,34),MUTED,int(W*0.8),46,center_x=cx)+34
    labels=["Відеоуроки","Теорія","Робочі файли","Шаблони","Чек-листи","Бонуси"]
    cols=3; gap=28; gw=int(W*0.86); cw=(gw-gap*(cols-1))//cols; gx=cx-gw/2; ch=int(cw*1.04)
    lf=font(F_BOLD,28)
    for i,lab in enumerate(labels):
        r=i//cols; c=i%cols; bx=gx+c*(cw+gap); by=y+r*(ch+gap)
        card(img,[bx,by,bx+cw,by+ch],r=26,fill=WHITE,shadow_blur=24,shadow_alpha=38,dy=12)
        dd=ImageDraw.Draw(img); folder(dd,int(bx+cw/2-46),int(by+40),92)
        lw=dd.textlength(lab,font=lf); dd.text((bx+cw/2-lw/2,by+ch-58),lab,font=lf,fill=INK)
    y+=2*ch+gap+(60 if fmt=="story" else 46)
    pill(img,cx,y,int(W*0.76),118,"Відкрити доступ",font(F_BOLD,42))
    d=ImageDraw.Draw(img); chips="відео • шаблони • чек-листи • бонуси"
    cw2=d.textlength(chips,font=font(F_REG,30)); d.text((cx-cw2/2,y+140),chips,font=font(F_REG,30),fill=MUTED)
    img.convert("RGB").save(f"{OUT}/v2_system_{fmt}.png",quality=95); print("saved v2",fmt)

def variant3(fmt):
    img,W,H=canvas(fmt); d=ImageDraw.Draw(img); cx=W//2
    top=160 if fmt=="story" else 96
    star(d,W-150,top+10,44,SILVER,12); star(d,120,H-(380 if fmt=="story" else 270),30,FOLDER,22)
    y=top; y=eyebrow(d,cx,y,"РЕЗУЛЬТАТИ УЧЕНИЦЬ",font(F_DISP,32))+34
    head=font(F_HEAVY,96 if fmt=="story" else 88)
    for ln,col in [("ДОХІД ×2",INK),("ЗА 2 МІСЯЦІ",ROSE)]:
        lw=d.textlength(ln,font=head); d.text((cx-lw/2,y),ln,font=head,fill=col); y+=head.size+4
    y+=20
    y=draw_wrapped(d,(0,y),"Реальні зміни учениць після роботи з системою ЧИТ-КОД.",font(F_REG,36),GRAPH,int(W*0.82),48,center_x=cx)+30
    cw=int(W*0.82); ch=300 if fmt=="story" else 280; cx0=cx-cw/2
    card(img,[cx0,y,cx0+cw,y+ch],r=34,fill=WHITE); dd=ImageDraw.Draw(img)
    dd.ellipse([cx0+44,y+44,cx0+44+86,y+44+86],fill=BLUSH)
    dd.text((cx0+44+30,y+44+22),"І",font=font(F_HEAVY,40),fill=ROSE)
    dd.text((cx0+152,y+52),"Іра",font=font(F_BOLD,36),fill=INK)
    draw_stars(dd,cx0+152,y+104,13,color=ROSE)
    draw_wrapped(dd,(cx0+44,y+160),"«Виросла в доході в 2 рази за 2 місяці. Нарешті чітка система, а не хаос.»",font(F_ITAL,34),GRAPH,cw-88,46)
    y+=ch+44
    stats=[("4+","роки в SMM"),("75+","учениць"),("7","потоків"),("10+","ніш")]
    gap=22; gw=int(W*0.86); cwid=(gw-gap*3)//4; gx=cx-gw/2; sh=150
    for i,(num,lab) in enumerate(stats):
        bx=gx+i*(cwid+gap)
        card(img,[bx,y,bx+cwid,y+sh],r=24,fill=WHITE,shadow_blur=20,shadow_alpha=34,dy=10)
        dd=ImageDraw.Draw(img); nf=font(F_HEAVY,52); nw=dd.textlength(num,font=nf)
        dd.text((bx+cwid/2-nw/2,y+26),num,font=nf,fill=ROSE); lf=font(F_REG,24)
        for j,word in enumerate(wrap(dd,lab,lf,cwid-16)):
            lw=dd.textlength(word,font=lf); dd.text((bx+cwid/2-lw/2,y+92+j*26),word,font=lf,fill=MUTED)
    y+=sh+(66 if fmt=="story" else 50)
    pill(img,cx,y,int(W*0.76),118,"Відкрити доступ",font(F_BOLD,42))
    d=ImageDraw.Draw(img); logo_strip(d,cx,y+150,36)
    img.convert("RGB").save(f"{OUT}/v3_proof_{fmt}.png",quality=95); print("saved v3",fmt)

for fmt in ("feed","story"):
    variant1(fmt); variant2(fmt); variant3(fmt)
print("DONE ->",OUT)

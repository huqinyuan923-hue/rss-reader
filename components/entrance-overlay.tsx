'use client'

import { useEffect, useState } from 'react'

/**
 * 进站引导动画（订阅抓取风，每会话一次）：
 * 报头显形 → 订阅源线条逐条滑入 → 整层淡出揭示。
 * 会话标记由 layout 内联脚本在文档开头完成；prefers-reduced-motion 直接跳过。
 */
export function EntranceOverlay() {
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (document.documentElement.dataset.boot === 'done') {
      setGone(true)
      return
    }
    const onAnimEnd = (e: AnimationEvent) => {
      if (e.animationName === 'rss-exit') {
        document.documentElement.dataset.boot = 'done'
        setGone(true)
      }
    }
    document.addEventListener('animationend', onAnimEnd)
    const fallback = window.setTimeout(() => {
      document.documentElement.dataset.boot = 'done'
      setGone(true)
    }, 6000)
    return () => {
      document.removeEventListener('animationend', onAnimEnd)
      window.clearTimeout(fallback)
    }
  }, [])

  if (gone) return null

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
html[data-boot='done'] .rss-boot{display:none}
.rss-boot{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;background:radial-gradient(ellipse 80% 55% at 50% 30%,rgba(251,146,60,.1),transparent),#0c1322;font-family:system-ui,sans-serif;animation:rss-exit .55s cubic-bezier(.65,0,.35,1) 2.6s forwards}
.rss-boot .r-logo{font-size:clamp(28px,5vw,48px);font-weight:800;color:#fb923c;letter-spacing:.03em;animation:rss-in .5s cubic-bezier(.22,1,.36,1) both}
.rss-boot .r-logo em{font-style:normal;color:#fdba74}
.rss-boot .r-feeds{display:flex;flex-direction:column;gap:9px;width:min(300px,70vw)}
.rss-boot .r-feeds span{display:block;height:10px;border-radius:6px;background:linear-gradient(90deg,rgba(251,146,60,.55),rgba(251,146,60,.12));transform:translateX(-24px);opacity:0;animation:rss-slide .4s ease both}
.rss-boot .r-feeds span:nth-child(1){width:100%;animation-delay:.35s}
.rss-boot .r-feeds span:nth-child(2){width:82%;animation-delay:.55s}
.rss-boot .r-feeds span:nth-child(3){width:64%;animation-delay:.75s}
.rss-boot .r-feeds span:nth-child(4){width:90%;animation-delay:.95s}
.rss-boot .r-bar{width:min(280px,62vw);height:3px;border-radius:999px;overflow:hidden;background:rgba(251,146,60,.16);opacity:0;animation:rss-in .3s ease 1.25s both}
.rss-boot .r-bar::before{content:'';display:block;height:100%;background:linear-gradient(90deg,#fb923c,#fdba74);transform:scaleX(0);transform-origin:left;animation:rss-fill 1.2s cubic-bezier(.3,0,.4,1) 1.35s forwards}
.rss-boot .r-status{font-family:ui-monospace,monospace;font-size:12px;letter-spacing:.1em;color:#94a3b8;opacity:0;animation:rss-in .3s ease 1.6s both}
.rss-boot .r-status b{color:#fb923c;font-weight:600}
@keyframes rss-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes rss-slide{to{transform:translateX(0);opacity:1}}
@keyframes rss-fill{to{transform:scaleX(1)}}
@keyframes rss-exit{to{opacity:0;visibility:hidden;transform:scale(1.04)}}
@media (prefers-reduced-motion:reduce){.rss-boot{display:none}}
`,
        }}
      />
      <div className="rss-boot" aria-hidden="true">
        <div className="r-logo">
          订阅站 <em>RSS</em>
        </div>
        <div className="r-feeds">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="r-bar" />
        <div className="r-status">
          {'> fetching feeds '}<b>· every day 03:00 UTC</b>
        </div>
      </div>
    </>
  )
}

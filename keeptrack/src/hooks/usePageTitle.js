import { useEffect } from 'react'

const APP_NAME = 'Keep Track'

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
    return () => { document.title = APP_NAME }
  }, [title])
}

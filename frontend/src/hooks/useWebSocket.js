import { useEffect, useState, useRef } from 'react'

export function useWebSocket() {
  const [events, setEvents] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${window.location.host}/ws`

        wsRef.current = new WebSocket(wsUrl)

        wsRef.current.onopen = () => {
          setIsConnected(true)
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
          }
        }

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)

            // Filter out system events
            if (data.type && (data.type === 'ping' || data.type === 'pong')) {
              return
            }

            setEvents(prev => {
              const updated = [data, ...prev]
              // Keep only last 50 events
              return updated.slice(0, 50)
            })
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err)
          }
        }

        wsRef.current.onclose = () => {
          setIsConnected(false)
          // Auto-reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000)
        }

        wsRef.current.onerror = (error) => {
          console.error('WebSocket error:', error)
          setIsConnected(false)
        }
      } catch (err) {
        console.error('WebSocket connection failed:', err)
        setIsConnected(false)
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000)
      }
    }

    connectWebSocket()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  return { events, isConnected }
}

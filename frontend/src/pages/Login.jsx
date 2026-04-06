import { useState } from 'react'
import api from '../utils/api'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const { data } = await api.post('/auth/login', { email, password })
      onLogin(data.user, data.token)
    } catch (err) {
      setError('로그인 정보를 확인해주세요.')
    }
  }

  return (
    <div className="auth-container">
      <div className="card">
        <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>AutoTrans Pro</h2>
        <form onSubmit={handleSubmit}>
          <div>
            <label>이메일</label>
            <input 
              type="email" 
              className="input-field"
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
          </div>
          <div>
            <label>비밀번호</label>
            <input 
              type="password" 
              className="input-field"
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </div>
          {error && <p style={{ color: 'red', fontSize: '0.8rem' }}>{error}</p>}
          <button type="submit" className="btn-primary">로그인</button>
        </form>
      </div>
    </div>
  )
}

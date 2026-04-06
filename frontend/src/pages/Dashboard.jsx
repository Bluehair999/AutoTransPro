import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { Plus, Folder, LogOut, Loader } from 'lucide-react'

export default function Dashboard({ user, onLogout }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      const { data } = await api.get('/projects')
      setProjects(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      const { data } = await api.post('/projects', { name: newProjectName })
      setProjects([...projects, data])
      setIsModalOpen(false)
      setNewProjectName('')
    } catch (err) {
      alert('프로젝트 생성 실패')
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>안녕하세요, {user.name}님</h1>
          <p style={{ color: 'var(--text-muted)' }}>AutoTrans 기업용 협업 플랫폼에 오신 것을 환영합니다.</p>
        </div>
        <button className="btn-ghost" onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LogOut size={18} /> 로그아웃
        </button>
      </header>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>내 프로젝트</h2>
          <button className="btn-primary" style={{ width: 'auto', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => setIsModalOpen(true)}>
            <Plus size={18} /> 새 프로젝트
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '5rem' }}><Loader className="animate-spin" /></div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem', background: 'white', borderRadius: '1rem', border: '2px dashed var(--border)' }}>
            <p>참여 중인 프로젝트가 없습니다. 새 프로젝트를 만들어보세요!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {projects.map(p => (
              <Link to={`/project/${p.id}`} key={p.id} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card" style={{ padding: '1.5rem', transition: 'transform 0.2s', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ background: '#e0e7ff', padding: '0.5rem', borderRadius: '0.5rem', color: 'var(--primary)' }}>
                      <Folder size={24} />
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{p.name}</h3>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <span>상태: {p.status}</span>
                    <span>비용: ${p.usage?.estimatedCost?.toFixed(2) || '0.00'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {isModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
            <h3>새 프로젝트 생성</h3>
            <form onSubmit={handleCreate}>
              <input 
                className="input-field" 
                placeholder="프로젝트 이름을 입력하세요" 
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                required
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>취소</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>생성하기</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

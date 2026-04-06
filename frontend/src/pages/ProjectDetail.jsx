import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { FileText, Users, ArrowLeft, Settings, CheckCircle, AlertTriangle } from 'lucide-react'
import { io } from 'socket.io-client'

export default function ProjectDetail({ user }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProject()

    const socket = io('/', { path: '/api/socket.io' }) 
    socket.emit('join-project', id)
    
    socket.on('job-status-update', (data) => {
      // Real-time update logic here
      console.log('Update received:', data)
      fetchProject() // Simple refresh for now
    })

    return () => socket.disconnect()
  }, [id])

  const fetchProject = async () => {
    try {
      const { data } = await api.get(`/projects/${id}`)
      setProject(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ padding: '5rem', textAlign: 'center' }}>로딩 중...</div>
  if (!project) return <div>프로젝트를 찾을 수 없습니다.</div>

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <button className="btn-ghost" onClick={() => navigate('/')} style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ArrowLeft size={18} /> 목록으로 돌아가기
      </button>

      <div style={{ background: 'white', borderRadius: '1rem', padding: '2rem', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: '0 0 0.5rem 0' }}>{project.name}</h1>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Users size={14} /> 멤버 {project.Members?.length || 0}명</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><FileText size={14} /> 파일 {project.files?.length || 0}개</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-ghost" title="설정"><Settings size={20} /></button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        <main>
          <section>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>파일 목록</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {project.files?.map(file => (
                <div key={file.id} style={{ background: 'white', padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <FileText className="text-muted" size={20} />
                      <span style={{ fontWeight: 500 }}>{file.name}</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', borderRadius: '4px', background: '#f1f5f9' }}>{file.status}</span>
                  </div>
                  {/* Progress bar placeholder */}
                  <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '2px', marginTop: '1rem', overflow: 'hidden' }}>
                    <div style={{ width: '60%', height: '100%', background: 'var(--primary)' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>

        <aside>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>품질 요약</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>평균 점수</span>
                <span style={{ fontWeight: 700, fontSize: '1.2rem', color: '#10b981' }}>98점</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b', fontSize: '0.85rem' }}>
                <AlertTriangle size={16} /> 검토 필요 페이지: 2개
              </div>
            </div>
          </div>
          
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--border)', marginTop: '1rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>참여 멤버</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {project.Members?.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#2563eb', color: 'white', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {m.name[0]}
                  </div>
                  <span>{m.name}</span>
                </div>
              ))}
              <button className="btn-ghost" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>+ 멤버 초대</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

const { Project, User, ProjectMember, File, Page } = require('../models');

exports.createProject = async (req, res) => {
  try {
    const { name, settings } = req.body;
    const project = await Project.create({ 
      name, 
      settings,
      ownerId: req.user.id 
    });
    
    // Add creator as Member with 'owner' role
    await ProjectMember.create({ 
      ProjectId: project.id, 
      UserId: req.user.id, 
      role: 'owner' 
    });

    res.json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getProjects = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Project, as: 'Projects' }]
    });
    res.json(user.Projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getProjectDetail = async (req, res) => {
  try {
    const project = await Project.findByPk(req.params.id, {
      include: [
        { model: File, as: 'files', include: [{ model: Page, as: 'pages' }] },
        { model: User, as: 'Members', attributes: ['id', 'name', 'email'] }
      ]
    });
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addMember = async (req, res) => {
  try {
    const { email, role } = req.body;
    const userToAdd = await User.findOne({ where: { email } });
    if (!userToAdd) return res.status(404).json({ error: 'User not found' });

    await ProjectMember.create({
      ProjectId: req.params.id,
      UserId: userToAdd.id,
      role: role || 'editor'
    });

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

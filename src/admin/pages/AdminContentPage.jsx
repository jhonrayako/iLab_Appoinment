import { useEffect, useRef, useState } from 'react';
import { visitorRequest } from '../../visitorApi';

const emptyForm = { label: '', title: '', detail: '', isPublished: false };
const emptySlideForm = { title: '', description: '', imageUrl: '', imageData: '', sortOrder: 0, isActive: true };
const MAX_SLIDE_IMAGE_BYTES = 6 * 1024 * 1024;

const defaultSiteContent = {
  hero_title: 'Connecting communities with science-driven plant innovation.',
  hero_description: 'iLAB Guiguinto advances tissue culture, ornamental planting, and sustainable agriculture through research, field support, and public access programs in Bulacan.',
  mission_title: 'Supporting farmers, growers, and communities through accessible agricultural science.',
  mission_summary: 'iLAB Guiguinto helps local agricultural stakeholders and the public understand modern plant propagation, nursery systems, and science-based practices that can improve productivity and resilience.',
  phone_number: '0955 593 4054',
  email_address: 'ilabguiguinto@gmail.com',
  location: 'Guiguinto, Bulacan',
};

function getAdminToken() {
  try {
    return JSON.parse(localStorage.getItem('ilab_admin_auth') || '{}')?.token || '';
  } catch {
    return '';
  }
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Image file could not be read.'));
    reader.readAsDataURL(blob);
  });
}

function hasUnsupportedImageFormat(slide) {
  return /^data:(application\/octet-stream|image\/hei[cf]);base64,/i.test(slide.image_data || '');
}

function AdminContentPage() {
  const [announcements, setAnnouncements] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [siteContent, setSiteContent] = useState(defaultSiteContent);
  const [slides, setSlides] = useState([]);
  const [slideForm, setSlideForm] = useState(emptySlideForm);
  const [editingSlideId, setEditingSlideId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savingSite, setSavingSite] = useState(false);
  const [savingSlide, setSavingSlide] = useState(false);
  const [readingSlideImage, setReadingSlideImage] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const slideFileInput = useRef(null);

  const loadAnnouncements = async () => {
    try {
      const data = await visitorRequest('/admin/content/announcements', { token: getAdminToken() });
      setAnnouncements(data.announcements || []);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load announcements.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSlides = async () => {
    try {
      const data = await visitorRequest('/admin/content/slides', { token: getAdminToken() });
      setSlides(data.slides || []);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load homepage slides.');
    }
  };

  const loadSiteContent = async () => {
    try {
      const data = await visitorRequest('/admin/content/site', { token: getAdminToken() });
      setSiteContent({ ...defaultSiteContent, ...(data.content || {}) });
    } catch (requestError) {
      setError(requestError.message || 'Unable to load site content.');
    }
  };

  useEffect(() => {
    loadAnnouncements();
    loadSiteContent();
    loadSlides();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setIsSaving(true);

    try {
      const data = await visitorRequest(
        editingId ? `/admin/content/announcements/${editingId}` : '/admin/content/announcements',
        {
          token: getAdminToken(),
          method: editingId ? 'PUT' : 'POST',
          body: JSON.stringify(form),
        }
      );
      setNotice(editingId ? 'Announcement updated.' : 'Announcement created.');
      resetForm();
      setAnnouncements((current) => {
        const next = current.filter((item) => item.announcement_id !== data.announcement.announcement_id);
        return [data.announcement, ...next];
      });
    } catch (requestError) {
      setError(requestError.message || 'Unable to save announcement.');
    } finally {
      setIsSaving(false);
    }
  };

  const editAnnouncement = (announcement) => {
    setEditingId(announcement.announcement_id);
    setForm({
      label: announcement.label,
      title: announcement.title,
      detail: announcement.detail,
      isPublished: announcement.is_published,
    });
    setError('');
    setNotice('');
  };

  const updateAnnouncement = async (announcementId, changes, successMessage) => {
    setError('');
    setNotice('');
    try {
      const data = await visitorRequest(`/admin/content/announcements/${announcementId}`, {
        token: getAdminToken(),
        method: 'PUT',
        body: JSON.stringify(changes),
      });
      setAnnouncements((current) => current.map((item) => (
        item.announcement_id === announcementId ? data.announcement : item
      )));
      setNotice(successMessage);
    } catch (requestError) {
      setError(requestError.message || 'Unable to update announcement.');
    }
  };

  const deleteAnnouncement = async (announcement) => {
    if (!window.confirm(`Delete "${announcement.title}"?`)) return;
    setError('');
    setNotice('');
    try {
      await visitorRequest(`/admin/content/announcements/${announcement.announcement_id}`, {
        token: getAdminToken(),
        method: 'DELETE',
      });
      setAnnouncements((current) => current.filter((item) => item.announcement_id !== announcement.announcement_id));
      if (editingId === announcement.announcement_id) resetForm();
      setNotice('Announcement deleted.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to delete announcement.');
    }
  };

  const handleSiteContentSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSavingSite(true);

    try {
      const data = await visitorRequest('/admin/content/site', {
        token: getAdminToken(),
        method: 'PUT',
        body: JSON.stringify(siteContent),
      });
      setSiteContent({ ...defaultSiteContent, ...(data.content || {}) });
      setNotice('Homepage content saved.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to save homepage content.');
    } finally {
      setSavingSite(false);
    }
  };

  const handleSlideFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setNotice('');
    const isHeic = /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    if (!file.type.startsWith('image/') && !isHeic) {
      setError('Choose a valid image file.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_SLIDE_IMAGE_BYTES) {
      setError('The image must be 6 MB or smaller.');
      event.target.value = '';
      return;
    }

    setReadingSlideImage(true);
    try {
      let imageFile = file;
      if (isHeic) {
        const { default: heic2any } = await import('heic2any');
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
        imageFile = Array.isArray(converted) ? converted[0] : converted;
      }

      const imageData = await readBlobAsDataUrl(imageFile);
      if (!imageData.startsWith('data:image/')) {
        throw new Error('The selected image is not in a browser-compatible format.');
      }
      setSlideForm((current) => ({ ...current, imageData, imageUrl: '' }));
    } catch (readError) {
      setError(isHeic
        ? 'This HEIC/HEIF image could not be converted. Try exporting it as JPEG or PNG.'
        : 'The selected image could not be read. Please try another image.');
      event.target.value = '';
    } finally {
      setReadingSlideImage(false);
    }
  };

  const handleSlideSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (readingSlideImage) {
      setError('Wait for the image preview to finish loading before saving.');
      return;
    }
    if (!slideForm.imageUrl.trim() && !slideForm.imageData) {
      setError('Add an image URL or upload an image before saving the slide.');
      return;
    }
    setSavingSlide(true);

    try {
      const payload = {
        title: slideForm.title.trim(),
        description: slideForm.description.trim(),
        imageUrl: slideForm.imageUrl.trim(),
        imageData: slideForm.imageData,
        sortOrder: Number(slideForm.sortOrder || 0),
        isActive: slideForm.isActive,
      };

      const data = await visitorRequest(
        editingSlideId ? `/admin/content/slides/${editingSlideId}` : '/admin/content/slides',
        {
          token: getAdminToken(),
          method: editingSlideId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        }
      );

      const nextSlide = data.slide;
      setSlides((current) => {
        const filtered = current.filter((item) => item.slide_id !== nextSlide.slide_id);
        return [...filtered, nextSlide].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
      });
      setSlideForm(emptySlideForm);
      setEditingSlideId('');
      if (slideFileInput.current) slideFileInput.current.value = '';
      setNotice(editingSlideId ? 'Slide updated.' : 'Slide added.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to save homepage slide.');
    } finally {
      setSavingSlide(false);
    }
  };

  const editSlide = (slide) => {
    setEditingSlideId(slide.slide_id);
    setSlideForm({
      title: slide.title || '',
      description: slide.description || '',
      imageUrl: slide.image_url || '',
      imageData: slide.image_data || '',
      sortOrder: slide.sort_order ?? 0,
      isActive: slide.is_active !== false,
    });
  };

  const deleteSlide = async (slide) => {
    if (!window.confirm(`Delete slide "${slide.title}"?`)) return;
    try {
      await visitorRequest(`/admin/content/slides/${slide.slide_id}`, {
        token: getAdminToken(),
        method: 'DELETE',
      });
      setSlides((current) => current.filter((item) => item.slide_id !== slide.slide_id));
      if (editingSlideId === slide.slide_id) {
        setEditingSlideId('');
        setSlideForm(emptySlideForm);
      }
      setNotice('Slide deleted.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to delete slide.');
    }
  };

  const repairSlideImage = async (slide) => {
    setError('');
    setNotice('');
    setSavingSlide(true);

    try {
      const sourceBlob = await fetch(slide.image_data).then((response) => response.blob());
      const { default: heic2any } = await import('heic2any');
      const converted = await heic2any({ blob: sourceBlob, toType: 'image/jpeg', quality: 0.9 });
      const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
      const imageData = await readBlobAsDataUrl(jpegBlob);
      const data = await visitorRequest(`/admin/content/slides/${slide.slide_id}`, {
        token: getAdminToken(),
        method: 'PUT',
        body: JSON.stringify({ imageUrl: '', imageData }),
      });

      setSlides((current) => current.map((item) => (
        item.slide_id === slide.slide_id ? data.slide : item
      )));
      setNotice('Slide image converted to JPEG and is ready for visitors.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to convert this slide image.');
    } finally {
      setSavingSlide(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Content</span>
          <h1>Homepage announcements</h1>
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {notice && <div className="success-banner" role="status">{notice}</div>}

      <div className="two-col admin-grid">
        <section className="panel">
          <h2>Homepage content</h2>
          <form className="form-grid" onSubmit={handleSiteContentSubmit}>
            <div className="input-row">
              <label htmlFor="site-hero-title">Hero title</label>
              <input id="site-hero-title" value={siteContent.hero_title} onChange={(event) => setSiteContent({ ...siteContent, hero_title: event.target.value })} />
            </div>
            <div className="input-row">
              <label htmlFor="site-hero-description">Hero description</label>
              <textarea id="site-hero-description" value={siteContent.hero_description} onChange={(event) => setSiteContent({ ...siteContent, hero_description: event.target.value })} />
            </div>
            <div className="input-row">
              <label htmlFor="site-mission-title">Mission headline</label>
              <input id="site-mission-title" value={siteContent.mission_title} onChange={(event) => setSiteContent({ ...siteContent, mission_title: event.target.value })} />
            </div>
            <div className="input-row">
              <label htmlFor="site-mission-summary">Mission summary</label>
              <textarea id="site-mission-summary" value={siteContent.mission_summary} onChange={(event) => setSiteContent({ ...siteContent, mission_summary: event.target.value })} />
            </div>
            <div className="input-row">
              <label htmlFor="site-phone">Phone number</label>
              <input id="site-phone" value={siteContent.phone_number} onChange={(event) => setSiteContent({ ...siteContent, phone_number: event.target.value })} />
            </div>
            <div className="input-row">
              <label htmlFor="site-email">Email address</label>
              <input id="site-email" value={siteContent.email_address} onChange={(event) => setSiteContent({ ...siteContent, email_address: event.target.value })} />
            </div>
            <div className="input-row">
              <label htmlFor="site-location">Location</label>
              <input id="site-location" value={siteContent.location} onChange={(event) => setSiteContent({ ...siteContent, location: event.target.value })} />
            </div>
            <div className="form-actions">
              <button className="button" type="submit" disabled={savingSite}>{savingSite ? 'Saving...' : 'Save homepage content'}</button>
            </div>
          </form>
        </section>

        <section className="panel">
          <h2>{editingId ? 'Edit announcement' : 'New announcement'}</h2>
          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="input-row">
              <label htmlFor="announcement-label">Label</label>
              <input id="announcement-label" name="label" maxLength="100" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} required />
            </div>
            <div className="input-row">
              <label htmlFor="announcement-title">Title</label>
              <input id="announcement-title" name="title" maxLength="255" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
            </div>
            <div className="input-row">
              <label htmlFor="announcement-detail">Details</label>
              <textarea id="announcement-detail" name="detail" value={form.detail} onChange={(event) => setForm({ ...form, detail: event.target.value })} required />
            </div>
            <label className="content-publish-toggle">
              <input type="checkbox" checked={form.isPublished} onChange={(event) => setForm({ ...form, isPublished: event.target.checked })} />
              <span>Published on the public homepage</span>
            </label>
            <div className="form-actions">
              <button className="button" type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : editingId ? 'Save changes' : 'Create announcement'}</button>
              {editingId && <button className="button-secondary" type="button" onClick={resetForm}>Cancel</button>}
            </div>
          </form>
        </section>
      </div>

      <section className="panel">
        <h2>Homepage slides</h2>
        <form className="form-grid" onSubmit={handleSlideSubmit}>
          <div className="input-row">
            <label htmlFor="slide-title">Slide title</label>
            <input id="slide-title" value={slideForm.title} onChange={(event) => setSlideForm({ ...slideForm, title: event.target.value })} required />
          </div>
          <div className="input-row">
            <label htmlFor="slide-description">Slide description</label>
            <textarea id="slide-description" value={slideForm.description} onChange={(event) => setSlideForm({ ...slideForm, description: event.target.value })} required />
          </div>
          <div className="input-row">
            <label htmlFor="slide-image-url">Image URL</label>
            <input id="slide-image-url" value={slideForm.imageUrl} onChange={(event) => setSlideForm({ ...slideForm, imageUrl: event.target.value, imageData: '' })} placeholder="https://... or /images/..." />
          </div>
          <div className="input-row">
            <label htmlFor="slide-image-upload">Upload image</label>
            <input ref={slideFileInput} id="slide-image-upload" type="file" accept="image/*" onChange={handleSlideFileChange} />
          </div>
          {(slideForm.imageData || slideForm.imageUrl) && (
            <div className="slide-image-preview-wrap" aria-live="polite">
              <span>{readingSlideImage ? 'Loading image preview...' : 'Slide image preview'}</span>
              {!readingSlideImage && <img className="slide-image-preview" src={slideForm.imageData || slideForm.imageUrl} alt="Preview of the homepage slide" />}
            </div>
          )}
          <div className="input-row">
            <label htmlFor="slide-sort-order">Display order</label>
            <input id="slide-sort-order" type="number" min="0" value={slideForm.sortOrder} onChange={(event) => setSlideForm({ ...slideForm, sortOrder: Number(event.target.value || 0) })} />
          </div>
          <label className="content-publish-toggle">
            <input type="checkbox" checked={slideForm.isActive} onChange={(event) => setSlideForm({ ...slideForm, isActive: event.target.checked })} />
            <span>Visible on the homepage</span>
          </label>
          <div className="form-actions">
            <button className="button" type="submit" disabled={savingSlide || readingSlideImage || (!slideForm.imageUrl.trim() && !slideForm.imageData)}>{readingSlideImage ? 'Reading image...' : savingSlide ? 'Saving...' : editingSlideId ? 'Save slide' : 'Add slide'}</button>
            {editingSlideId && <button className="button-secondary" type="button" onClick={() => { setEditingSlideId(''); setSlideForm(emptySlideForm); }}>Cancel</button>}
          </div>
        </form>

        {slides.length > 0 && (
          <div className="content-slide-list">
            {slides.map((slide) => (
              <div key={slide.slide_id || slide.title} className="content-slide-item">
                <img src={slide.image_url || slide.image_data || slide.image || '/images/ilab-news.jpg'} alt={slide.title} />
                <div>
                  <strong>{slide.title}</strong>
                  <p>{slide.description}</p>
                  <small>{slide.is_active === false ? 'Hidden' : 'Visible'} · Order {slide.sort_order ?? 0}</small>
                </div>
                <div className="content-actions">
                  {hasUnsupportedImageFormat(slide) && <button className="button-secondary small-button" type="button" onClick={() => repairSlideImage(slide)} disabled={savingSlide}>Repair image</button>}
                  <button className="button-secondary small-button" type="button" onClick={() => editSlide(slide)}>Edit</button>
                  <button className="button-ghost small-button" type="button" onClick={() => deleteSlide(slide)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel table-panel">
        <h2>All announcements</h2>
        {isLoading ? <p>Loading announcements...</p> : announcements.length === 0 ? (
          <p>No announcements yet. Add one to publish an update to the homepage.</p>
        ) : (
          <table className="data-table content-table">
            <thead>
              <tr><th>Announcement</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {announcements.map((announcement) => (
                <tr key={announcement.announcement_id}>
                  <td>
                    <small>{announcement.label}</small>
                    <strong>{announcement.title}</strong>
                    <p>{announcement.detail}</p>
                  </td>
                  <td><span className={`badge ${announcement.is_published ? 'confirmed' : 'cancelled'}`}>{announcement.is_published ? 'Published' : 'Draft'}</span></td>
                  <td>
                    <div className="content-actions">
                      <button className="button-secondary small-button" type="button" onClick={() => editAnnouncement(announcement)}>Edit</button>
                      <button className="button-ghost small-button" type="button" onClick={() => updateAnnouncement(announcement.announcement_id, { isPublished: !announcement.is_published }, announcement.is_published ? 'Announcement unpublished.' : 'Announcement published.')}>{announcement.is_published ? 'Unpublish' : 'Publish'}</button>
                      <button className="button-ghost small-button" type="button" onClick={() => deleteAnnouncement(announcement)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default AdminContentPage;

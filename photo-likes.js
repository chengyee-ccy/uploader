/* One Firebase entry per photo and visitor keeps repeated likes idempotent. */
class PhotoLikes {
  constructor(app, onChange, onError) {
    this.app = app;
    this.onChange = onChange;
    this.onError = onError;
    this.likes = {};
    this.pending = new Set();
    this.loaded = false;
    this.userId = null;
    this.ref = app.database().ref("photoLikes");
  }

  get ready() {
    return this.loaded && Boolean(this.userId);
  }

  async connect() {
    try {
      const auth = this.app.auth();
      const restoredUser = await new Promise((resolve, reject) => {
        const unsubscribe = auth.onAuthStateChanged(user => {
          unsubscribe();
          resolve(user);
        }, reject);
      });
      const user = restoredUser || (await auth.signInAnonymously()).user;
      this.userId = user.uid;
      // The embedding wedding page and other tabs can update the shared login.
      auth.onAuthStateChanged(currentUser => {
        this.userId = currentUser?.uid || null;
        this.onChange();
      });
      this.ref.on("value", snapshot => {
        this.likes = snapshot.val() || {};
        this.loaded = true;
        this.onChange();
      }, error => {
        this.loaded = false;
        this.onChange();
        this.onError(error, "load");
      });
    } catch (error) {
      this.onError(error, "load");
    }
  }

  getState(fileId) {
    const visitors = this.likes[fileId] || {};
    return {
      count: Object.values(visitors).filter(value => value === true).length,
      liked: visitors[this.userId] === true,
      pending: this.pending.has(fileId),
      ready: this.ready
    };
  }

  async setLiked(fileId, liked) {
    if (!this.ready || this.pending.has(fileId)) return false;
    if (this.getState(fileId).liked === liked) return true;

    this.pending.add(fileId);
    this.onChange();
    try {
      await this.ref.child(fileId).child(this.userId).set(liked ? true : null);
      return true;
    } catch (error) {
      this.onError(error, "save");
      return false;
    } finally {
      this.pending.delete(fileId);
      this.onChange();
    }
  }
}

import Ember from 'ember';

export default Ember.Route.extend({
  model() {
    return Ember.RSVP.reject('Congratulations, you failed!');
  }
});

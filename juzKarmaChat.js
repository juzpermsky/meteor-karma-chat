messages = new Mongo.Collection("messages");
userVotes = new Mongo.Collection("userVotes");
userKarma = new Mongo.Collection("userKarma");

if (Meteor.isServer) {
  // This code only runs on the server
  Meteor.publish("userStatus", function() {
    return Meteor.users.find({ "status.online": true });
  });
  Meteor.publish("messages", function() {
    return messages.find({}, {sort: {createdAt: -1}, limit: 200});
  });
  Meteor.publish("userVotes", function() {
    return userVotes.find({userId:Meteor.userId()});
  });
  Meteor.publish("userKarma", function() {
    return userKarma.find({});
  });


}


if (Meteor.isClient) {

  Meteor.subscribe('userStatus');
  Meteor.subscribe('messages');
  Meteor.subscribe('userVotes');
  Meteor.subscribe('userKarma');


  Template.registerHelper('formatDate', function(date) {
    return moment(date).format('MM-DD-YYYY HH:mm:ss');
  });

  Template.body.helpers({
    messages: function () {
      return messages.find({}, {sort: {createdAt: -1}, limit: 200});
    },
    karma: function (){
      if(! Meteor.userId()){
        throw new Meteor.Error("not-authorized");
      }
      var tmpl=Template.instance();
      Meteor.call("getUserKarma", Meteor.userId(),function(err,result){
        if(err){
          console.log(err);
        } 
        else{
          tmpl.myKarma.set(result);
        }
      });
      return tmpl.myKarma.get();
    }
  });
  
  Template.usersOnline.helpers({
    usersOnline: function() {
      var usr =  Meteor.users.find({ "status.online": true });
      return { exists:(usr.count()>0), list:usr, count:usr.count() };
    }
  });

  Template.onlineUser.helpers({
    getName: function() {
      var uname = this.username;
      if(typeof uname == "undefined"){
        uname = this.profile.name;
      }
      return uname;
    },
    getKarma: function() {
      var doc = userKarma.findOne({userId:this._id});
      if(typeof doc == "undefined"){
        return 0;
      }else{
        return doc.vote;      
      }
    }
  });

  Template.onlineUser.events({
    "click .username": function (event) {
      $(".inputText").val("@"+event.target.textContent+":"+$(".inputText").val());
    }
  });  


  Template.body.events({
    "submit .new-message": function (event) {
      // Prevent default browser form submit
      event.preventDefault();

      // Get value from form element
      var text = event.target.text.value;
      
      Meteor.call("addMessage", text);  

      // Clear form
      event.target.text.value = "";
    } 
  });


  Template.body.created = function (){
    this.myKarma = new ReactiveVar(0);
  }

  Template.message.events({
    "click .delete": function (event) {
      Meteor.call("deleteMessage",this._id);  
    },
    "click .thumbsUp": function (event) {
      var thisMessage = this;
      if(thisMessage.owner == Meteor.userId()){
        console.log("can not vote for own message");
        return;
      }
      Meteor.call("updateUserVotes",Meteor.userId(),thisMessage._id,1,function(err,result){
        if(err){
          console.log(err);
        } 
        else{
          var inverse = (result==0);
          Meteor.call("voteMessage",thisMessage._id,1,inverse);
          Meteor.call("updateUserKarma",thisMessage.owner,1);
        }
      });
    },
    "click .thumbsDown": function (event) {
      var thisMessage = this;
      if(thisMessage.owner == Meteor.userId()){
        console.log("can not vote for own message");
        return;
      }
      Meteor.call("updateUserVotes",Meteor.userId(),thisMessage._id,-1,function(err,result){
        if(err){
          console.log(err);
        } 
        else{
          var inverse = (result==0);
          Meteor.call("voteMessage",thisMessage._id,-1,inverse);
          Meteor.call("updateUserKarma",thisMessage.owner,-1);
        }
      });
    },
    "click .username": function (event) {
      $(".inputText").val("@"+event.target.textContent+":"+$(".inputText").val());
    }
  });

  Template.message.helpers({
    isOwner: function () {
      return this.owner === Meteor.userId();
    },
    isVoted: function () {
      var tmpl = Template.instance();
      Meteor.call('getUserVote',Meteor.userId(),this._id, function (err, result) {
        if(err){
          console.log(err);
        } 
        else{
          tmpl.userVote.set(result);
        }
      });
      
      var curVote = Template.instance().userVote.get();
      var isUp = (curVote==1);
      var isDown = (curVote==-1);
      return {up:isUp,down:isDown};
    },
    toMe: function (){
      var username = Meteor.user().username;
      if(typeof username == "undefined"){
        username = Meteor.user().profile.name;
      }
      return(this.text.indexOf("@"+username) > -1)
    }
  });

  Template.message.created = function (){
      this.userVote = new ReactiveVar(0);
  }

  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });
}

Meteor.methods({
  addMessage: function (text) {
    // Make sure the user is logged in before inserting a task
    if (! Meteor.userId()) {
      throw new Meteor.Error("not-authorized");
    }
    
    var username = Meteor.user().username;
    if(typeof username == "undefined"){
      username = Meteor.user().profile.name;
    }

    messages.insert({
      text: text,
      createdAt: new Date(),
      owner: Meteor.userId(),
      username: username
    });
  },
  deleteMessage: function (messageId) {
    var message = messages.findOne(messageId);
    if (message.owner !== Meteor.userId()) {
      // Make sure only the owner can delete its message
      throw new Meteor.Error("not-authorized");
    }
    messages.remove(messageId);
  },
  voteMessage: function (messageId, vote, inverse=false) {
    if (! Meteor.userId()) {
      throw new Meteor.Error("not-authorized");
    }
    if((vote !=1)&&(vote !=-1)){
      throw new Meteor.Error("vote must be 1 or -1");
    }
    var message = messages.findOne(messageId);

    var thumbsUp;
    var thumbsDown;

    if(typeof message.thumbsUp == "undefined"){
      thumbsUp = 0;
    }else{
      thumbsUp = message.thumbsUp;
    }
    if(typeof message.thumbsDown == "undefined"){
      thumbsDown = 0;
    }else{
      thumbsDown = message.thumbsDown;
    }
    
    if(!inverse){
      if(vote>0){
        thumbsUp++;
        messages.update({_id: messageId}, {$set: {thumbsUp: thumbsUp}});
      }else{
        thumbsDown--;
        messages.update({_id: messageId}, {$set: {thumbsDown: thumbsDown}});
      }
    }else{
      if(vote>0){
        thumbsDown++;
        messages.update({_id: messageId}, {$set: {thumbsDown: thumbsDown}});
      }else{
        thumbsUp--;
        messages.update({_id: messageId}, {$set: {thumbsUp: thumbsUp}});
      }
    } 
  },
  getUserKarma: function(userId){
    var doc = userKarma.findOne({userId:userId});
    console.log(doc)
    if(typeof doc == "undefined"){
      return 0;
    }else{
      return doc.vote;      
    }
  },
  updateUserKarma: function(userId,vote){
    if((vote !=1)&&(vote !=-1)){
      throw new Meteor.Error("vote must be 1 or -1");
    }
    var doc = userKarma.findOne({userId:userId});
    if(typeof doc == "undefined"){
      userKarma.insert({userId: userId ,vote: vote});
    }else{
      userKarma.update({_id: doc._id}, {$set: {vote: doc.vote+vote}});
    }
  },
  updateUserVotes: function(userId,messageId,vote){
    if((vote !=1)&&(vote !=-1)){
      throw new Meteor.Error("vote must be 1 or -1");
    }
    var doc = userVotes.findOne({userId:userId, messageId:messageId});
    if(typeof doc == "undefined"){
      userVotes.insert({userId: userId , messageId: messageId, vote: vote});
      return vote;
    }else{
      if((vote+doc.vote)==0){
        userVotes.remove(doc._id);
        return 0;
      }else{
        throw new Meteor.Error("already voted");
      }
    }
  },
  getUserVote: function(userId,messageId){
    var doc = userVotes.findOne({userId:userId, messageId:messageId});
    if(typeof doc == "undefined"){
      return 0;
    }else{
      return doc.vote;
    }
  }
});


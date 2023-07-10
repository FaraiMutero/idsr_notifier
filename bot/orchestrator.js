const chatModelFactory = require("../bot/chat.json");
const server = require("../bot/server.json");
const app = require("../bot/app.js");

var userSessions = [];

function addUserSession(msg) {
  let session = JSON.parse(JSON.stringify(msg.chat));
  session["nextChatStep"] = 1;
  session["sessionEnded"] = false;
  session["loggedIn"] = false;
  session["interactions"] = [
    {
      chatStep: 1,
      text: msg.text,
      stepSuccess: false,
      timeStamp: new Date(),
    },
  ];
  userSessions.push(session);
}

function addInteraction(session, msg, valueTag) {
  if (
    session.interactions.find(
      (item) => item.chatStep == session.nextChatStep
    ) == null
  ) {
    session.interactions.push({
      chatStep: session.nextChatStep,
      text: msg.text,
      stepSuccess: false,
      timeStamp: new Date(),
      tag: valueTag
    });
  } else
    session.interactions.find(
      (item) => item.chatStep == session.nextChatStep
    ).text = msg.text;
}

function getUserSession(msg) {
  let userSession = null;
  let sessionCreated = false;

  if (userSessions.find((user) => (user.id == msg.chat.id) && (user.sessionEnded == false)) == null) {
    addUserSession(msg)
    sessionCreated = true;
  }

  userSession = userSessions.find((user) => (user.id == msg.chat.id) && (user.sessionEnded == false));

  if (userSession.sessionEnded) {
    //Reset session if user wants to start all over
    userSession.nextChatStep = 1;
    userSession.sessionEnded = false;
  }

  if (sessionCreated == false)
    addInteraction(userSession, msg);

  return userSession;
}

function isTerminatorDetected(msg, chatModel) {
  let terminatorDetected = false;

  for (let y = 0; y < chatModel.props[chatModel.stop].triggers.length; y++) {
    if (
      msg.text
        .toLowerCase()
        .includes(chatModel.props[chatModel.stop].triggers[y])
    ) {
      terminatorDetected = true;
      break;
    }
  }
  return terminatorDetected;
}

function invokeAction(actionKey, userSession, chatStep, chatModel) {
  return new Promise(async function (resolve, reject) {
    if (userSession.interactions.find((item) => item.chatStep == chatStep) != null) {

      if (chatModel.props[chatStep].tag != null)
        userSession.interactions.find((item) => item.chatStep == chatStep).tag = chatModel.props[chatStep].tag //apply tag to value

      if (actionKey == "show_welcome") {
        let result = await app.fetchUserByTelegramID(userSession.id);
        let subscribersGroupID = server.env.bot.model.constants.props[server.env.bot.model.constants.subscribersUserGroup].value
        let userInfo = (result.data.users.length > 0) ? result.data.users.find(usr => usr.telegram == userSession.id) : null;

        if (userInfo) {
          if (userInfo.userGroups.find(grp => grp.id == subscribersGroupID) != null)
            userSession.loggedIn = true;
          userSession.profile = JSON.parse(JSON.stringify(userInfo))
        }

        userSession.interactions.find((item) => item.chatStep == chatStep).stepSuccess = true;
        userSession.nextChatStep += 1;

        if (userSession.loggedIn) {
          //switch chatModel
          chatModel = chatModelFactory.loggedIn
          resolve({
            "result": "success",
            "response": chatModel.props[chatStep].text.replace('{name}', userSession.profile.name)
          });
        }
        else {
          resolve({
            "result": "success",
            "response": chatModel.props[chatStep].text
          });
        }
      }
      else if (actionKey == "verify_subscriber_user_name") {
        let userName = userSession.interactions.find((item) => item.chatStep == chatStep).text;
        let checkResults = await app.checkUserName(userName)

        if (checkResults.data.users.length > 0) {
          userSession.interactions.find((item) => item.chatStep == chatStep).stepSuccess = true;
          userSession.nextChatStep += 1;
          resolve({
            "result": "success",
            "response": chatModel.props[chatStep].text
          });
        }
        else {
          reject({
            "result": "error",
            "response": chatModel.props[chatStep].error
          });
        }
      }
      else if (actionKey == "verify_subscriber_password") {
        let userName = userSession.interactions.find((item) => item.tag == "user_name").text;
        let password = userSession.interactions.find((item) => item.tag == "password").text;
        let authResults = null;

        try {
          authResults = await app.checkUserCredentials(userName, password)
        }
        catch (error) {
          console.log(error)
        }

        if (authResults != null) {

          app.registerUser(userSession.id, authResults.data) // register user TelegramID after successful login

          userSession.interactions.find((item) => item.chatStep == chatStep).stepSuccess = true;
          userSession.sessionEnded = chatModel.props[chatStep].sessionTerminator ? true : false;
          userSession.nextChatStep += 1;

          resolve({
            "result": "success",
            "response": chatModel.props[chatStep].text
          });

        }
        else
          reject({
            "result": "error",
            "response": chatModel.props[chatStep].error
          });
      }
      else if (actionKey == "verify_unsubscribe_password") {
        let userName = userSession.interactions.find((item) => item.tag == "user_name").text;
        let password = userSession.interactions.find((item) => item.tag == "password").text;
        let authResults = null;

        try {
          authResults = await app.checkUserCredentials(userName, password)
        }
        catch (error) {
          console.log(error)
        }

        if (authResults != null) {

          app.unregisterUser(userSession) // register user TelegramID after successful login

          userSession.interactions.find((item) => item.chatStep == chatStep).stepSuccess = true;
          userSession.sessionEnded = chatModel.props[chatStep].sessionTerminator ? true : false;
          userSession.nextChatStep += 1;

          resolve({
            "result": "success",
            "response": chatModel.props[chatStep].text
          });
        }
        else
          reject({
            "result": "error",
            "response": chatModel.props[chatStep].error
          });
      }
    }
  });
}

async function prepareResponse(userSession, msg) {
  let response = "Your input was not detected";
  let matchFound = false;
  let inputText = msg.text;
  let chatStartStep = userSession.nextChatStep;
  let chatModel = (userSession.loggedIn == true) ? chatModelFactory.loggedIn : chatModelFactory.anonymous;

  if (isTerminatorDetected(msg, chatModel) == false) {
    for (let x = chatStartStep; x <= chatModel.stop; x++) {
      if (!matchFound) {
        if (chatModel.props[x].invokeAction == false) {
          for (let y = 0; y < chatModel.props[x].triggers.length; y++) {
            if (inputText.toLowerCase().includes(chatModel.props[x].triggers[y])) {
              response = chatModel.props[x].text;
              matchFound = true;
              userSession.nextChatStep += 1;
              userSession.interactions.find(
                (item) => item.chatStep == x
              ).stepSuccess = true;
              userSession.sessionEnded = chatModel.props[x].sessionTerminator ? true : false;
              break;
            }
          }
          if (!matchFound){
            response = chatModel.props[x].error;
            break;
          }
        }
        else {
          if (chatModel.props[x].triggers.length == 0) {
            return invokeAction(chatModel.props[x].action, userSession, x, chatModel)
          }
          else {
            for (let y = 0; y < chatModel.props[x].triggers.length; y++) {
              if (inputText.toLowerCase().includes(chatModel.props[x].triggers[y])) {
                matchFound = true;
                return invokeAction(chatModel.props[x].action, userSession, x, chatModel)
              }
            }
            if (!matchFound){
              response = chatModel.props[x].error;
              break;
            }
          }
        }
      }
    }
  } else {
    userSession.sessionEnded = true;
    response = chatModel.props[chatModel.stop].text;
  }

  return response;
}

exports.handleBotResponse = function (data, bot, chatId) {
  let botResponse = (data.response) ? data.response : data
  bot.sendMessage(chatId, botResponse);
}

exports.respond = function (msg) {
  let userSession = getUserSession(msg);
  return prepareResponse(userSession, msg);
}

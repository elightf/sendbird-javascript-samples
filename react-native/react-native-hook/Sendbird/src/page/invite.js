import React, { useLayoutEffect, useEffect, useReducer, useState } from 'react';
import {
  Text,
  StatusBar,
  SafeAreaView,
  View,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Switch,
  AppState,
} from 'react-native';
import { StackActions } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { withAppContext } from '../context';
import { inviteReducer } from '../reducer/invite';
import User from '../component/user';
import { setEnabled } from 'react-native/Libraries/Performance/Systrace';

const Invite = props => {
  const { route, navigation, sendbird } = props;
  const { currentUser, channel, isForCall } = route.params;

  const [query, setQuery] = useState(null);
  const [callee, setCallee] = useState('elight')
  const [state, dispatch] = useReducer(inviteReducer, {
    channel,
    users: [],
    userMap: {},
    selectedUsers: [],
    loading: false,
    error: '',
  });

  useLayoutEffect(() => {
    const right = (
      <View style={style.headerRightContainer}>
        <TouchableOpacity activeOpacity={0.85} style={style.inviteButton} onPress={invite}>
          <Icon name="done" color="#fff" size={28} />
        </TouchableOpacity>
      </View>
    );
    navigation.setOptions({
      headerRight: () => right,
    });
  });

  // on state change
  useEffect(() => {
    sendbird.addConnectionHandler('invite', connectionHandler);
    const unsubscribe = AppState.addEventListener('change', handleStateChange);

    if (!sendbird.currentUser) {
      sendbird.connect(currentUser.userId, (_, err) => {
        if (!err) {
          refresh();
        } else {
          dispatch({
            type: 'error',
            payload: {
              error: 'Connection failed. Please check the network status.',
            },
          });
        }
      });
    } else {
      refresh();
    }

    return () => {
      dispatch({ type: 'end-loading' });
      sendbird.removeConnectionHandler('invite');
      unsubscribe.remove();
    };
  }, []);

  useEffect(() => {
    if (query) {
      next();
    }
  }, [query]);

  /// on connection event
  const connectionHandler = new sendbird.ConnectionHandler();
  connectionHandler.onReconnectStarted = () => {
    dispatch({
      type: 'error',
      payload: {
        error: 'Connecting..',
      },
    });
  };
  connectionHandler.onReconnectSucceeded = () => {
    dispatch({
      type: 'error',
      payload: {
        error: '',
      },
    });
    refresh();
  };
  connectionHandler.onReconnectFailed = () => {
    dispatch({
      type: 'error',
      payload: {
        error: 'Connection failed. Please check the network status.',
      },
    });
  };

  const handleStateChange = newState => {
    if (newState === 'active') {
      sendbird.setForegroundState();
    } else {
      sendbird.setBackgroundState();
    }
  };
  
  const invite = async () => {
    if (!isForCall) {
      if (state.selectedUsers.length > 0) {
        dispatch({ type: 'start-loading' });
        // Navigate to chat
        try {
          if (!channel) {
            const params = new sendbird.GroupChannelParams();
            params.addUsers(state.selectedUsers);
            const createdChannel = await sendbird.GroupChannel.createChannel(params);

            dispatch({ type: 'end-loading' });
            navigation.dispatch(
              StackActions.replace('Chat', {
                currentUser,
                channel: createdChannel,
              }),
            );
          } else {
            await channel.invite(state.selectedUsers);
            dispatch({ type: 'end-loading' });
            navigation.goBack();
          }
        } catch (err) {
          dispatch({
            type: 'error',
            payload: { error: err.message },
          });
        }
      } else {
        dispatch({
          type: 'error',
          payload: { error: 'Select at least 1 user to invite.' },
        });
      }
    } else {
      // Navigate to call
      navigation.dispatch(
        StackActions.replace('Video', {
          identity: callee,
        }),
      );
    }
  };
  
  const refresh = () => {
    setQuery(sendbird.createApplicationUserListQuery());
    dispatch({ type: 'refresh' });
  };

  const next = () => {
    if (query.hasNext) {
      dispatch({ type: 'start-loading' });
      query.limit = 50;
      query.next((fetchedUsers, err) => {
        dispatch({ type: 'end-loading' });
        if (!err) {
          dispatch({
            type: 'fetch-users',
            payload: { users: fetchedUsers },
          });
        } else {
          dispatch({
            type: 'error',
            payload: {
              error: 'Failed to get the users.',
            },
          });
        }
      });
    }
  };

  const onSelect = user => {
    if (isForCall) {
      // Direct calls only ATM
      if (state.selectedUsers.length > 0) {
        dispatch({ type: 'unselect-user', payload: { user: state.selectedUsers[0] }})
        dispatch({ type: 'select-user', payload: { user } });  
      }
    }
    if (!state.selectedUsers.includes(user)) {
      dispatch({ type: 'select-user', payload: { user } });
    } else {
      dispatch({ type: 'unselect-user', payload: { user } });
    }
  };

  const [isEnabled, setIsEnabled] = useState(false)
  const toggleSwitch = () => setIsEnabled(prevState => {
    if (!prevState) {
      setCallee('thomas')
    } else {
      setCallee('elight')
    }
    return !prevState
  })

  return (
    <>
      <StatusBar backgroundColor="#742ddd" barStyle="light-content" />
      <SafeAreaView style={style.container}>
        { !isForCall 
        ? ( 
          <FlatList
            data={state.users}
            renderItem={({ item }) => (
              <User
                key={item.userId}
                user={item}
                selected={state.selectedUsers.includes(item)}
                selectable={true}
                onSelect={onSelect}
              />
            )}
            keyExtractor={item => item.userId}
            refreshControl={
              <RefreshControl refreshing={state.loading} colors={['#742ddd']} tintColor={'#742ddd'} onRefresh={refresh} />
            }
            contentContainerStyle={{ flexGrow: 1 }}
            ListHeaderComponent={
              state.error && (
                <View style={style.errorContainer}>
                  <Text style={style.error}>{state.error}</Text>
                </View>
              )
            }
            onEndReached={() => next()}
            onEndReachedThreshold={0.5}
          />
        )
        : (
          <View style={style.switch}>
            <Text>Who are you calling? Hint: It can't be you</Text>
            <Switch 
              onValueChange={toggleSwitch}
              value={isEnabled}
            />
            <Text>{callee}</Text>
          </View>
        )
      }
      </SafeAreaView>
    </>
  );
};

const style = {
  container: {
    flex: 1,
  },
  switch: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  inviteButton: {
    marginRight: 12,
  },
  errorContainer: {
    backgroundColor: '#333',
    opacity: 0.8,
    padding: 10,
  },
  error: {
    color: '#fff',
  },
};

export default withAppContext(Invite);

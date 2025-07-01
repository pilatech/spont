import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  Modal,
  AppState,
  ActivityIndicator,
} from 'react-native';
import * as Notifications from 'expo-notifications';

// Configure notifications for Expo Go (local notifications only)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Request permissions on app start
Notifications.requestPermissionsAsync().catch(error => {
  console.log('Notification permission request failed:', error);
});

interface User {
  id: string;
  email: string;
  name: string;
  budget: number;
}

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: {
    day: string;
    month: string;
    year: string;
  };
  gender: 'male' | 'female' | 'other';
  relationship: string;
  aboutThem: string;
  favoriteColors: string[];
  favoriteFlowers: string[];
  allergies: string[];
  budgetRange: { min: number; max: number };
  specialDates: Array<{ type: string; date: string }>;
  address: {
    street: string;
    city: string;
    postcode: string;
  };
  contactInfo: {
    phone: string;
    email: string;
  };
}

interface Suggestion {
  id: string;
  name: string;
  price: number;
  description: string;
  image: string;
  score: number;
  personId: string;
  status: 'pending' | 'accepted' | 'rejected';
}

interface SuggestionWithPerson {
  suggestion: Suggestion;
  person: Person;
}

type Screen = 'dashboard' | 'people' | 'budget' | 'suggestions';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionWithPerson[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  
  // Notification and timer state
  const [pendingSuggestions, setPendingSuggestions] = useState<Set<string>>(new Set());
  const [automaticSuggestionsEnabled, setAutomaticSuggestionsEnabled] = useState(true);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const appState = useRef(AppState.currentState);
  
  // Authentication state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Add person form state
  const [newPerson, setNewPerson] = useState<Partial<Person>>({
    firstName: '',
    lastName: '',
    dateOfBirth: { day: '', month: '', year: '' },
    gender: 'other',
    relationship: '',
    aboutThem: '',
    favoriteColors: [],
    favoriteFlowers: [],
    allergies: [],
    budgetRange: { min: 30, max: 80 },
    specialDates: [],
    address: { street: '', city: '', postcode: '' },
    contactInfo: { phone: '', email: '' },
  });

  // Setup notifications
  useEffect(() => {
    setupNotifications();
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Clear any existing pending suggestions on app start
    setPendingSuggestions(new Set());
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();
    
    return () => {
      subscription?.remove();
      // Clear all timers
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const setupNotifications = async () => {
    try {
      console.log('Setting up local notifications for Expo Go...');
      
      // Check current permission status
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log('Current notification permission status:', existingStatus);
      
      let finalStatus = existingStatus;
      
      // Request permission if not already granted
      if (existingStatus !== 'granted') {
        console.log('Requesting notification permissions...');
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
        console.log('New notification permission status:', finalStatus);
      }
      
      if (finalStatus !== 'granted') {
        console.log('Notification permission not granted');
        Alert.alert(
          'Notifications Disabled', 
          'Please enable notifications in your device settings to receive automatic gift suggestions!'
        );
        return;
      }
      
      console.log('Local notification permissions granted for Expo Go');
      
      // Listen for notification responses (when user taps notification)
      const notificationListener = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Notification response received:', response);
        if (response.notification.request.content.data?.type === 'suggestion') {
          setCurrentScreen('suggestions');
        }
      });
      
      // Listen for notifications received while app is in foreground
      const foregroundListener = Notifications.addNotificationReceivedListener(notification => {
        console.log('Local notification received in foreground:', notification);
      });
      
      return () => {
        Notifications.removeNotificationSubscription(notificationListener);
        Notifications.removeNotificationSubscription(foregroundListener);
      };
    } catch (error) {
      console.error('Error setting up local notifications:', error);
      Alert.alert(
        'Notification Setup Error',
        'There was an issue setting up local notifications. The app will use in-app alerts instead.'
      );
    }
  };

  const handleAppStateChange = (nextAppState: string) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground, check for pending suggestions
      checkPendingSuggestions();
    }
    appState.current = nextAppState;
  };

  const scheduleAutomaticSuggestion = (person: Person) => {
    // Clear any existing timer for this person
    const existingTimer = timersRef.current.get(person.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      timersRef.current.delete(person.id);
    }

    // Check if suggestion already exists for this person
    const existingSuggestion = suggestions.find(s => s.person.id === person.id);
    if (existingSuggestion) {
      console.log(`Suggestion already exists for ${person.firstName}, skipping automatic suggestion`);
      return;
    }

    // Calculate a random interval between 30 seconds and 5 minutes for this person
    const minInterval = 30000; // 30 seconds
    const maxInterval = 300000; // 5 minutes
    const randomInterval = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
    
    console.log(`Scheduling automatic suggestion for ${person.firstName} in ${Math.round(randomInterval/1000)} seconds...`);
    
    const timerId = setTimeout(async () => {
      try {
        console.log(`Timer fired for ${person.firstName}, generating suggestion...`);
        
        // Check if we still have people and budget
        if (people.length === 0) {
          console.log('No people to suggest for, skipping automatic suggestion');
          return;
        }
        
        if (!currentUser || currentUser.budget <= 0) {
          console.log('No budget available, skipping automatic suggestion');
          Alert.alert(
            'No Budget Available',
            `We couldn't generate suggestions for ${person.firstName} because there's no budget set. Please set a budget in the Budget tab.`
          );
          return;
        }

        // Double-check that no suggestion exists for this person
        const currentSuggestions = suggestions;
        const suggestionExists = currentSuggestions.find(s => s.person.id === person.id);
        if (suggestionExists) {
          console.log(`Suggestion already exists for ${person.firstName}, skipping automatic suggestion`);
          return;
        }
        
        console.log(`Making API call for ${person.firstName} with budget ${currentUser.budget}...`);
        setLoadingSuggestions(true);
        
        const response = await fetch('http://192.168.1.222:4000/api/suggest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            people: [person],
            budget: currentUser.budget
          }),
        });

        console.log(`API response status: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`API response data:`, data);
          
          // Take only the first suggestion and associate it with the person
          const suggestion = data[0];
          if (suggestion) {
            console.log(`Creating suggestion for ${person.firstName}:`, suggestion.name);
            
            const suggestionWithPerson: SuggestionWithPerson = {
              suggestion: {
                ...suggestion,
                personId: person.id,
                status: 'pending'
              },
              person: person
            };
            
            setSuggestions(prev => {
              // Check again to prevent duplicates
              const alreadyExists = prev.find(s => s.person.id === person.id);
              if (alreadyExists) {
                console.log(`Suggestion already exists for ${person.firstName}, not adding duplicate`);
                return prev;
              }
              console.log(`Adding suggestion for ${person.firstName} to state`);
              return [...prev, suggestionWithPerson];
            });
            
            // Send local notification
            try {
              console.log('Sending local notification for Expo Go...');
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: '🌸 Perfect Gift Found!',
                  body: `We found the perfect ${suggestion.name} for ${person.firstName}!`,
                  data: { type: 'suggestion', personId: person.id },
                  sound: true,
                },
                trigger: null, // Send immediately
              });
              console.log('Local notification sent successfully in Expo Go');
            } catch (notificationError) {
              console.log('Could not send local notification in Expo Go:', notificationError);
              // Show in-app alert as fallback
              Alert.alert(
                '🌸 Perfect Gift Found!',
                `We found the perfect ${suggestion.name} for ${person.firstName}! Check the Suggestions tab.`,
                [
                  { text: 'View Suggestions', onPress: () => setCurrentScreen('suggestions') },
                  { text: 'Later', style: 'cancel' }
                ]
              );
            }
          } else {
            console.log('No suggestion data received from API');
          }
          
          // Remove from pending
          setPendingSuggestions(prev => {
            const newSet = new Set(prev);
            newSet.delete(person.id);
            console.log(`Removed ${person.firstName} from pending suggestions`);
            return newSet;
          });
        } else {
          console.error(`API call failed with status ${response.status}`);
          const errorText = await response.text();
          console.error('API error response:', errorText);
          
          // Remove from pending on error too
          setPendingSuggestions(prev => {
            const newSet = new Set(prev);
            newSet.delete(person.id);
            console.log(`Removed ${person.firstName} from pending suggestions due to error`);
            return newSet;
          });
        }
      } catch (error) {
        console.error('Error generating automatic suggestions:', error);
        Alert.alert(
          'Suggestion Error',
          `Failed to generate suggestion for ${person.firstName}. Please check your connection and try again.`
        );
        
        // Remove from pending on error
        setPendingSuggestions(prev => {
          const newSet = new Set(prev);
          newSet.delete(person.id);
          console.log(`Removed ${person.firstName} from pending suggestions due to error`);
          return newSet;
        });
      } finally {
        setLoadingSuggestions(false);
      }
    }, randomInterval); // Random interval between 30 seconds and 5 minutes

    timersRef.current.set(person.id, timerId);
    setPendingSuggestions(prev => new Set(prev).add(person.id));
    console.log(`Timer set for ${person.firstName}, pending suggestions:`, Array.from(new Set([...pendingSuggestions, person.id])));
  };

  const checkPendingSuggestions = () => {
    // Check if any timers have expired while app was in background
    const now = Date.now();
    pendingSuggestions.forEach(personId => {
      const person = people.find(p => p.id === personId);
      if (person) {
        // If more than 30 seconds have passed, generate suggestions immediately
        scheduleAutomaticSuggestion(person);
      }
    });
  };

  const clearAllSuggestions = () => {
    Alert.alert(
      'Clear All Suggestions',
      'Are you sure you want to clear all suggestions? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            setSuggestions([]);
            // Clear all pending timers
            timersRef.current.forEach(timer => clearTimeout(timer));
            timersRef.current.clear();
            setPendingSuggestions(new Set());
            Alert.alert('Cleared', 'All suggestions have been cleared.');
          },
        },
      ]
    );
  };

  const acceptSuggestion = (suggestionWithPerson: SuggestionWithPerson) => {
    const updatedSuggestion = {
      ...suggestionWithPerson,
      suggestion: {
        ...suggestionWithPerson.suggestion,
        status: 'accepted' as const
      }
    };
    
    setSuggestions(prev => 
      prev.map(s => 
        s.suggestion.id === suggestionWithPerson.suggestion.id ? updatedSuggestion : s
      )
    );
    
    Alert.alert(
      '🎉 Gift Accepted!',
      `Perfect! You've chosen ${suggestionWithPerson.suggestion.name} for ${suggestionWithPerson.person.firstName}.`,
      [
        { text: 'Buy Now', onPress: () => handleBuyGift(suggestionWithPerson) },
        { text: 'Later', style: 'cancel' }
      ]
    );
  };

  const rejectSuggestion = (suggestionWithPerson: SuggestionWithPerson) => {
    const updatedSuggestion = {
      ...suggestionWithPerson,
      suggestion: {
        ...suggestionWithPerson.suggestion,
        status: 'rejected' as const
      }
    };
    
    setSuggestions(prev => 
      prev.map(s => 
        s.suggestion.id === suggestionWithPerson.suggestion.id ? updatedSuggestion : s
      )
    );
    
    Alert.alert(
      '🔄 Suggestion Rejected',
      `No worries! We'll find something better for ${suggestionWithPerson.person.firstName} next time.`,
      [
        { text: 'Get New Suggestion', onPress: () => getNewSuggestion(suggestionWithPerson.person) },
        { text: 'Maybe Later', style: 'cancel' }
      ]
    );
  };

  const handleBuyGift = (suggestionWithPerson: SuggestionWithPerson) => {
    Alert.alert(
      '🛒 Purchase Gift',
      `Redirecting to Gardenia Shop to purchase ${suggestionWithPerson.suggestion.name} for £${suggestionWithPerson.suggestion.price}`,
      [
        { text: 'Continue', onPress: () => {
          // Here you would integrate with the actual purchase flow
          Alert.alert('Success', 'Redirecting to checkout...');
        }},
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const getNewSuggestion = async (person: Person) => {
    if (!currentUser || currentUser.budget <= 0) {
      Alert.alert(
        'No Budget Available',
        'Please set a budget in the Budget tab before getting new suggestions!'
      );
      return;
    }

    try {
      setLoadingSuggestions(true);
      const response = await fetch('http://192.168.1.222:4000/api/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          people: [person],
          budget: currentUser.budget
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newSuggestion = data[0];
        if (newSuggestion) {
          const suggestionWithPerson: SuggestionWithPerson = {
            suggestion: {
              ...newSuggestion,
              personId: person.id,
              status: 'pending'
            },
            person: person
          };
          
          // Replace the existing suggestion with the new one
          setSuggestions(prev => {
            const filtered = prev.filter(s => s.person.id !== person.id);
            return [...filtered, suggestionWithPerson];
          });
          
          Alert.alert('✨ New Suggestion', `Here's a new option for ${person.firstName}!`);
        } else {
          Alert.alert('No New Suggestions', 'We couldn\'t find any new suggestions within your budget. Try increasing your budget or adding more details about this person.');
        }
      }
    } catch (error) {
      console.error('Error getting new suggestion:', error);
      Alert.alert('Error', 'Failed to get new suggestion. Please try again.');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleLogin = () => {
    if (!loginEmail || !loginPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    const user: User = {
      id: '1',
      email: loginEmail,
      name: 'Demo User',
      budget: 500,
    };
    
    setCurrentUser(user);
    setIsAuthenticated(true);
    setLoginEmail('');
    setLoginPassword('');
  };

  const addPerson = () => {
    if (!newPerson.firstName || !newPerson.relationship) {
      Alert.alert('Error', 'Name and relationship are required');
      return;
    }

    const person: Person = {
      id: Date.now().toString(),
      firstName: newPerson.firstName!,
      lastName: newPerson.lastName || '',
      dateOfBirth: newPerson.dateOfBirth || { day: '', month: '', year: '' },
      gender: newPerson.gender || 'other',
      relationship: newPerson.relationship!,
      aboutThem: newPerson.aboutThem || '',
      favoriteColors: newPerson.favoriteColors || [],
      favoriteFlowers: newPerson.favoriteFlowers || [],
      allergies: newPerson.allergies || [],
      budgetRange: newPerson.budgetRange || { min: 30, max: 80 },
      specialDates: newPerson.specialDates || [],
      address: newPerson.address || { street: '', city: '', postcode: '' },
      contactInfo: newPerson.contactInfo || { phone: '', email: '' },
    };

    setPeople([...people, person]);
    setShowAddPerson(false);
    
    // Check if we can schedule automatic suggestions
    if (currentUser && currentUser.budget > 0 && automaticSuggestionsEnabled) {
      // Schedule automatic suggestions for this person
      scheduleAutomaticSuggestion(person);
      
      // Show confirmation
      Alert.alert(
        'Person Added! 🌸',
        `${person.firstName} has been added. You'll receive personalized gift suggestions soon!`,
        [{ text: 'OK' }]
      );
    } else if (currentUser && currentUser.budget > 0 && !automaticSuggestionsEnabled) {
      // Show message about automatic suggestions being disabled
      Alert.alert(
        'Person Added! 🌸',
        `${person.firstName} has been added. Automatic suggestions are disabled. Use the "Test Suggestion" button to get suggestions manually.`,
        [{ text: 'OK' }]
      );
    } else {
      // Show message about setting budget
      Alert.alert(
        'Person Added! 🌸',
        `${person.firstName} has been added. Set a budget in the Budget tab to receive gift suggestions!`,
        [{ text: 'OK' }]
      );
    }
    
    setNewPerson({
      firstName: '',
      lastName: '',
      dateOfBirth: { day: '', month: '', year: '' },
      gender: 'other',
      relationship: '',
      aboutThem: '',
      favoriteColors: [],
      favoriteFlowers: [],
      allergies: [],
      budgetRange: { min: 30, max: 80 },
      specialDates: [],
      address: { street: '', city: '', postcode: '' },
      contactInfo: { phone: '', email: '' },
    });
  };

  const editPerson = () => {
    if (!editingPerson || !newPerson.firstName || !newPerson.relationship) {
      Alert.alert('Error', 'Name and relationship are required');
      return;
    }

    const updatedPerson: Person = {
      ...editingPerson,
      firstName: newPerson.firstName!,
      lastName: newPerson.lastName || '',
      dateOfBirth: newPerson.dateOfBirth || { day: '', month: '', year: '' },
      gender: newPerson.gender || 'other',
      relationship: newPerson.relationship!,
      aboutThem: newPerson.aboutThem || '',
      favoriteColors: newPerson.favoriteColors || [],
      favoriteFlowers: newPerson.favoriteFlowers || [],
      allergies: newPerson.allergies || [],
      budgetRange: newPerson.budgetRange || { min: 30, max: 80 },
      specialDates: newPerson.specialDates || [],
      address: newPerson.address || { street: '', city: '', postcode: '' },
      contactInfo: newPerson.contactInfo || { phone: '', email: '' },
    };

    setPeople(people.map(p => p.id === editingPerson.id ? updatedPerson : p));
    setEditingPerson(null);
    setNewPerson({
      firstName: '',
      lastName: '',
      dateOfBirth: { day: '', month: '', year: '' },
      gender: 'other',
      relationship: '',
      aboutThem: '',
      favoriteColors: [],
      favoriteFlowers: [],
      allergies: [],
      budgetRange: { min: 30, max: 80 },
      specialDates: [],
      address: { street: '', city: '', postcode: '' },
      contactInfo: { phone: '', email: '' },
    });
  };

  const startEditing = (person: Person) => {
    setEditingPerson(person);
    setNewPerson({
      firstName: person.firstName,
      lastName: person.lastName,
      dateOfBirth: person.dateOfBirth,
      gender: person.gender,
      relationship: person.relationship,
      aboutThem: person.aboutThem,
      favoriteColors: person.favoriteColors,
      favoriteFlowers: person.favoriteFlowers,
      allergies: person.allergies,
      budgetRange: person.budgetRange,
      specialDates: person.specialDates,
      address: person.address,
      contactInfo: person.contactInfo,
    });
  };

  const deletePerson = (id: string) => {
    Alert.alert(
      'Delete Person',
      'Are you sure you want to delete this person?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Clear any pending timer for this person
            const timer = timersRef.current.get(id);
            if (timer) {
              clearTimeout(timer);
              timersRef.current.delete(id);
            }
            
            // Remove from pending suggestions
            setPendingSuggestions(prev => {
              const newSet = new Set(prev);
              newSet.delete(id);
              return newSet;
            });
            
            // Remove any existing suggestions for this person
            setSuggestions(prev => prev.filter(s => s.person.id !== id));
            
            setPeople(people.filter(p => p.id !== id));
          },
        },
      ]
    );
  };

  const updateBudget = (newBudget: number) => {
    if (currentUser) {
      setCurrentUser({ ...currentUser, budget: newBudget });
    }
  };

  const fetchSuggestions = async () => {
    if (people.length === 0) {
      Alert.alert('No People', 'Please add some people first to get suggestions!');
      return;
    }

    if (!currentUser || currentUser.budget <= 0) {
      Alert.alert(
        'No Budget Set', 
        'Please set a budget in the Budget tab before getting suggestions!'
      );
      return;
    }

    setLoadingSuggestions(true);
    try {
      // Generate one suggestion per person (only for people without existing suggestions)
      const newSuggestions: SuggestionWithPerson[] = [];
      const peopleWithoutSuggestions = people.filter(person => 
        !suggestions.find(s => s.person.id === person.id)
      );
      
      if (peopleWithoutSuggestions.length === 0) {
        Alert.alert('All People Have Suggestions', 'All your people already have suggestions! You can accept, reject, or get new suggestions for existing ones.');
        setLoadingSuggestions(false);
        return;
      }
      
      for (const person of peopleWithoutSuggestions) {
        const response = await fetch('http://192.168.1.222:4000/api/suggest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            people: [person],
            budget: currentUser.budget
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const suggestion = data[0];
          if (suggestion) {
            newSuggestions.push({
              suggestion: {
                ...suggestion,
                personId: person.id,
                status: 'pending'
              },
              person: person
            });
          }
        }
      }
      
      if (newSuggestions.length === 0) {
        Alert.alert('No Suggestions Found', 'We couldn\'t find any suitable suggestions with your current budget. Try increasing your budget or adding more details about your people.');
        return;
      }
      
      setSuggestions(prev => [...prev, ...newSuggestions]);
      Alert.alert('Success', `Found ${newSuggestions.length} perfect suggestions for your people!`);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      Alert.alert('Error', 'Failed to fetch suggestions. Please check your connection and try again.');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const renderDashboard = () => (
    <ScrollView style={styles.content}>
      <View style={styles.dashboard}>
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>🌸 Welcome back!</Text>
          <Text style={styles.welcomeSubtitle}>
            Ready to spread some joy with thoughtful gifts?
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{people.length}</Text>
            <Text style={styles.statLabel}>People</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>£{currentUser?.budget || 0}</Text>
            <Text style={styles.statLabel}>Budget</Text>
            {(!currentUser || currentUser.budget <= 0) && (
              <View style={styles.budgetWarning}>
                <Text style={styles.budgetWarningText}>Set budget</Text>
              </View>
            )}
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{suggestions.length}</Text>
            <Text style={styles.statLabel}>Suggestions</Text>
            {pendingSuggestions.size > 0 && (
              <View style={styles.pendingIndicator}>
                <Text style={styles.pendingText}>⏳ {pendingSuggestions.size} pending</Text>
              </View>
            )}
            {suggestions.filter(s => s.suggestion.status === 'accepted').length > 0 && (
              <View style={styles.acceptedIndicator}>
                <Text style={styles.acceptedText}>✅ {suggestions.filter(s => s.suggestion.status === 'accepted').length} accepted</Text>
              </View>
            )}
          </View>
        </View>
        
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Recent Activity</Text>
          {people.length > 0 ? (
            <View style={styles.activityItem}>
              <Text style={styles.activityText}>
                ✨ Added {people[people.length - 1].firstName} {people[people.length - 1].lastName} ({people[people.length - 1].relationship})
              </Text>
              <Text style={styles.activityTime}>Just now</Text>
            </View>
          ) : (
            <Text style={styles.emptyActivityText}>No people added yet</Text>
          )}
        </View>
        
        <View style={styles.card}>
          <Text style={styles.cardTitle}>�� Next Steps</Text>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.stepText}>Add friends & family</Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.stepText}>Set budget preferences</Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3</Text>
            <Text style={styles.stepText}>Enable AI suggestions</Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>4</Text>
            <Text style={styles.stepText}>Connect to Gardenia Shop</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderPeople = () => (
    <ScrollView style={styles.content}>
      <View style={styles.people}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddPerson(true)}
        >
          <Text style={styles.addButtonText}>✨ Add Person</Text>
        </TouchableOpacity>
        
        {people.map((person) => (
          <View key={person.id} style={styles.personCard}>
            <View style={styles.personHeader}>
              <View style={styles.personAvatar}>
                <Text style={styles.avatarText}>
                  {person.firstName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.personInfo}>
                <Text style={styles.personName} numberOfLines={1} ellipsizeMode="tail">{person.firstName} {person.lastName}</Text>
                <Text style={styles.personRelationship} numberOfLines={1} ellipsizeMode="tail">{person.relationship}</Text>
                {person.dateOfBirth.day && person.dateOfBirth.month && person.dateOfBirth.year && (
                  <Text style={styles.personDate}>🎂 {person.dateOfBirth.day}/{person.dateOfBirth.month}/{person.dateOfBirth.year}</Text>
                )}
                {pendingSuggestions.has(person.id) && (
                  <Text style={styles.pendingSuggestionText}>⏳ Suggestions coming soon...</Text>
                )}
              </View>
              <View style={styles.personActions}>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => startEditing(person)}
                >
                  <Text style={styles.editButtonText}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => deletePerson(person.id)}
                >
                  <Text style={styles.deleteButtonText}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {person.aboutThem && (
              <View style={styles.aboutSection}>
                <Text style={styles.aboutLabel}>About {person.firstName}:</Text>
                <Text style={styles.aboutText}>{person.aboutThem}</Text>
              </View>
            )}
            
            {person.contactInfo?.phone && (
              <View style={styles.contactSection}>
                <Text style={styles.contactText}>📞 {person.contactInfo.phone}</Text>
              </View>
            )}
          </View>
        ))}
        
        {people.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={styles.emptyTitle}>No people added yet</Text>
            <Text style={styles.emptySubtitle}>
              Start by adding friends, family, or colleagues to receive personalized gift suggestions
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderBudget = () => (
    <ScrollView style={styles.content}>
      <View style={styles.budget}>
        <View style={styles.card}>
          <Text style={styles.cardTitle} numberOfLines={1} ellipsizeMode="tail">Monthly Budget</Text>
          <TextInput
            style={styles.budgetInput}
            placeholder="Enter budget amount"
            keyboardType="numeric"
            value={currentUser?.budget.toString()}
            onChangeText={(text) => updateBudget(parseInt(text) || 0)}
          />
          <Text style={styles.budgetText}>Current: £{currentUser?.budget}</Text>
        </View>
        
        <View style={styles.card}>
          <Text style={styles.cardTitle} numberOfLines={1} ellipsizeMode="tail">Budget Breakdown</Text>
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>Total People:</Text>
            <Text style={styles.breakdownValue}>{people.length}</Text>
          </View>
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>Average per person:</Text>
            <Text style={styles.breakdownValue}>
              £{people.length > 0 ? Math.round(currentUser?.budget! / people.length) : 0}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderSuggestions = () => (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🌸 Gift Suggestions</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton]} 
            onPress={clearAllSuggestions}
          >
            <Text style={styles.buttonText}>Clear All</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Debug Info */}
      <View style={styles.debugSection}>
        <Text style={styles.debugTitle}>Debug Info:</Text>
        <Text style={styles.debugText}>People: {people.length}</Text>
        <Text style={styles.debugText}>Budget: £{currentUser?.budget || 0}</Text>
        <Text style={styles.debugText}>Suggestions: {suggestions.length}</Text>
        <Text style={styles.debugText}>Pending: {pendingSuggestions.size}</Text>
        <Text style={styles.debugText}>Loading: {loadingSuggestions ? 'Yes' : 'No'}</Text>
        <Text style={styles.debugText}>Auto Suggestions: {automaticSuggestionsEnabled ? 'ON' : 'OFF'}</Text>
        <TouchableOpacity 
          style={[styles.button, styles.clearButton]} 
          onPress={() => {
            setPendingSuggestions(new Set());
            timersRef.current.forEach(timer => clearTimeout(timer));
            timersRef.current.clear();
            Alert.alert('Cleared', 'All pending suggestions cleared.');
          }}
        >
          <Text style={styles.buttonText}>Clear Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.button, styles.clearButton]} 
          onPress={() => {
            setPendingSuggestions(new Set());
            timersRef.current.forEach(timer => clearTimeout(timer));
            timersRef.current.clear();
            setSuggestions([]);
            Alert.alert('Cleared', 'All suggestions and pending states cleared.');
          }}
        >
          <Text style={styles.buttonText}>Clear Everything</Text>
        </TouchableOpacity>
      </View>

      {loadingSuggestions && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF69B4" />
          <Text style={styles.loadingText}>Generating suggestions...</Text>
        </View>
      )}

      {suggestions.length === 0 && !loadingSuggestions && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No Suggestions Yet</Text>
          <Text style={styles.emptyStateText}>
            {people.length === 0 
              ? "Add some people first to get personalized gift suggestions!"
              : currentUser?.budget <= 0
              ? "Set a budget to start getting gift suggestions!"
              : "Suggestions will appear here automatically. Check back soon!"
            }
          </Text>
        </View>
      )}

      {suggestions.length > 0 && (
        <ScrollView style={styles.suggestionsList}>
          {suggestions.map((suggestionWithPerson, index) => (
            <View key={`${suggestionWithPerson.person.id}-${suggestionWithPerson.suggestion.id || index}`} style={styles.suggestionCard}>
              <View style={styles.suggestionHeader}>
                <Text style={styles.personName}>
                  For {suggestionWithPerson.person.firstName} {suggestionWithPerson.person.lastName}
                </Text>
                <View style={[
                  styles.statusBadge,
                  suggestionWithPerson.suggestion.status === 'accepted' && styles.statusAccepted,
                  suggestionWithPerson.suggestion.status === 'rejected' && styles.statusRejected
                ]}>
                  <Text style={styles.statusText}>
                    {suggestionWithPerson.suggestion.status === 'pending' && '⏳ Pending'}
                    {suggestionWithPerson.suggestion.status === 'accepted' && '✅ Accepted'}
                    {suggestionWithPerson.suggestion.status === 'rejected' && '❌ Rejected'}
                  </Text>
                </View>
              </View>
              
              <Text style={styles.suggestionName}>{suggestionWithPerson.suggestion.name}</Text>
              <Text style={styles.suggestionPrice}>£{suggestionWithPerson.suggestion.price}</Text>
              <Text style={styles.suggestionDescription}>{suggestionWithPerson.suggestion.description}</Text>
              
              {suggestionWithPerson.suggestion.status === 'pending' && (
                <View style={styles.suggestionActions}>
                  <TouchableOpacity 
                    style={[styles.button, styles.acceptButton]} 
                    onPress={() => acceptSuggestion(suggestionWithPerson)}
                  >
                    <Text style={styles.buttonText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.button, styles.rejectButton]} 
                    onPress={() => rejectSuggestion(suggestionWithPerson)}
                  >
                    <Text style={styles.buttonText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
              
              {suggestionWithPerson.suggestion.status === 'accepted' && (
                <TouchableOpacity 
                  style={[styles.button, styles.buyButton]} 
                  onPress={() => handleBuyGift(suggestionWithPerson)}
                >
                  <Text style={styles.buttonText}>Buy Now</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        
        <View style={styles.authContainer}>
          <View style={styles.authHeader}>
            <Text style={styles.authEmoji}>🌸</Text>
            <Text style={styles.title}>Spontaneous Gifting</Text>
            <Text style={styles.subtitle}>AI-Powered Flower Gifts</Text>
          </View>

          <View style={styles.authForm}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={loginEmail}
              onChangeText={setLoginEmail}
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={loginPassword}
              onChangeText={setLoginPassword}
              secureTextEntry
            />
            <TouchableOpacity style={styles.button} onPress={handleLogin}>
              <Text style={styles.buttonText}>Sign In</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.demoText}>
            Demo: Use any email/password to continue
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Welcome, {currentUser?.name}! 👋</Text>
        <Text style={styles.headerSubtitle}>Your spontaneous gifting dashboard</Text>
      </View>

      <View style={styles.navigation}>
        <TouchableOpacity
          style={[styles.navButton, currentScreen === 'dashboard' && styles.activeNavButton]}
          onPress={() => setCurrentScreen('dashboard')}
        >
          <Text style={[styles.navText, currentScreen === 'dashboard' && styles.activeNavText]}>
            🏠
          </Text>
          <Text 
            style={[styles.navLabel, currentScreen === 'dashboard' && styles.activeNavLabel]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            Dashboard
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, currentScreen === 'people' && styles.activeNavButton]}
          onPress={() => setCurrentScreen('people')}
        >
          <Text style={[styles.navText, currentScreen === 'people' && styles.activeNavText]}>
            👥
          </Text>
          <Text 
            style={[styles.navLabel, currentScreen === 'people' && styles.activeNavLabel]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            People ({people.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, currentScreen === 'budget' && styles.activeNavButton]}
          onPress={() => setCurrentScreen('budget')}
        >
          <Text style={[styles.navText, currentScreen === 'budget' && styles.activeNavText]}>
            💰
          </Text>
          <Text 
            style={[styles.navLabel, currentScreen === 'budget' && styles.activeNavLabel]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            Budget
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, currentScreen === 'suggestions' && styles.activeNavButton]}
          onPress={() => setCurrentScreen('suggestions')}
        >
          <Text style={[styles.navText, currentScreen === 'suggestions' && styles.activeNavText]}>
            🤖
          </Text>
          <Text 
            style={[styles.navLabel, currentScreen === 'suggestions' && styles.activeNavLabel]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            Suggestions
          </Text>
        </TouchableOpacity>
      </View>

      {currentScreen === 'dashboard' && renderDashboard()}
      {currentScreen === 'people' && renderPeople()}
      {currentScreen === 'budget' && renderBudget()}
      {currentScreen === 'suggestions' && renderSuggestions()}

      <Modal visible={showAddPerson || editingPerson !== null} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingPerson ? '✏️ Edit Person' : '✨ Add Person'}
            </Text>
            <TouchableOpacity onPress={() => {
              setShowAddPerson(false);
              setEditingPerson(null);
              setNewPerson({
                firstName: '',
                lastName: '',
                dateOfBirth: { day: '', month: '', year: '' },
                gender: 'other',
                relationship: '',
                aboutThem: '',
                favoriteColors: [],
                favoriteFlowers: [],
                allergies: [],
                budgetRange: { min: 30, max: 80 },
                specialDates: [],
                address: { street: '', city: '', postcode: '' },
                contactInfo: { phone: '', email: '' },
              });
            }}>
              <Text style={styles.closeButton}>×</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <TextInput
              style={styles.input}
              placeholder="First Name"
              value={newPerson.firstName}
              onChangeText={(text) => setNewPerson({...newPerson, firstName: text})}
            />
            <TextInput
              style={styles.input}
              placeholder="Last Name"
              value={newPerson.lastName}
              onChangeText={(text) => setNewPerson({...newPerson, lastName: text})}
            />
            <TextInput
              style={styles.input}
              placeholder="Relationship (e.g., Mother, Brother, Friend, Colleague)"
              value={newPerson.relationship}
              onChangeText={(text) => setNewPerson({...newPerson, relationship: text})}
            />
            <View style={styles.dateInputContainer}>
              <Text style={styles.dateLabel}>🎂 Date of Birth</Text>
              <View style={styles.dateFieldsRow}>
                <TextInput
                  style={[styles.input, styles.dateInput]}
                  placeholder="DD"
                  value={newPerson.dateOfBirth?.day}
                  onChangeText={(text) => {
                    const day = text.replace(/[^0-9]/g, '').slice(0, 2);
                    setNewPerson({
                      ...newPerson, 
                      dateOfBirth: { 
                        ...newPerson.dateOfBirth, 
                        day 
                      }
                    });
                    // Auto-focus to month when day is complete
                    if (day.length === 2) {
                      // Focus next input (month)
                    }
                  }}
                  keyboardType="numeric"
                  maxLength={2}
                />
                <Text style={styles.dateSeparator}>-</Text>
                <TextInput
                  style={[styles.input, styles.dateInput]}
                  placeholder="MM"
                  value={newPerson.dateOfBirth?.month}
                  onChangeText={(text) => {
                    const month = text.replace(/[^0-9]/g, '').slice(0, 2);
                    // Validate month (1-12)
                    const monthNum = parseInt(month);
                    if (monthNum > 12) return;
                    
                    setNewPerson({
                      ...newPerson, 
                      dateOfBirth: { 
                        ...newPerson.dateOfBirth, 
                        month 
                      }
                    });
                    // Auto-focus to year when month is complete
                    if (month.length === 2) {
                      // Focus next input (year)
                    }
                  }}
                  keyboardType="numeric"
                  maxLength={2}
                />
                <Text style={styles.dateSeparator}>-</Text>
                <TextInput
                  style={[styles.input, styles.dateInput]}
                  placeholder="YYYY"
                  value={newPerson.dateOfBirth?.year}
                  onChangeText={(text) => {
                    const year = text.replace(/[^0-9]/g, '').slice(0, 4);
                    // Validate year (not in future)
                    const yearNum = parseInt(year);
                    const currentYear = new Date().getFullYear();
                    if (yearNum > currentYear) return;
                    
                    setNewPerson({
                      ...newPerson, 
                      dateOfBirth: { 
                        ...newPerson.dateOfBirth, 
                        year 
                      }
                    });
                  }}
                  keyboardType="numeric"
                  maxLength={4}
                />
              </View>
            </View>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={`About ${newPerson.firstName || 'them'} (personality, interests, preferences, etc.)`}
              value={newPerson.aboutThem}
              onChangeText={(text) => setNewPerson({...newPerson, aboutThem: text})}
              multiline
              numberOfLines={4}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              value={newPerson.contactInfo?.phone}
              onChangeText={(text) => setNewPerson({
                ...newPerson, 
                contactInfo: {...newPerson.contactInfo, phone: text}
              })}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={newPerson.contactInfo?.email}
              onChangeText={(text) => setNewPerson({
                ...newPerson, 
                contactInfo: {...newPerson.contactInfo, email: text}
              })}
            />
          </ScrollView>
          
          <View style={styles.modalFooter}>
            <TouchableOpacity 
              style={styles.button} 
              onPress={editingPerson ? editPerson : addPerson}
            >
              <Text style={styles.buttonText}>
                {editingPerson ? 'Update Person' : 'Add Person'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  authHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  authEmoji: {
    fontSize: 48,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#212529',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#6c757d',
    textAlign: 'center',
  },
  authForm: {
    marginBottom: 20,
  },
  input: {
    height: 56,
    borderWidth: 2,
    borderColor: '#e9ecef',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#ffffff',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
    paddingTop: 20,
  },
  button: {
    backgroundColor: '#667eea',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 56,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  demoText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#6c757d',
    fontStyle: 'italic',
  },
  header: {
    padding: 16,
    paddingTop: 32,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6c757d',
    marginTop: 4,
  },
  navigation: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    paddingHorizontal: 10,
  },
  navButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    minHeight: 60,
    justifyContent: 'center',
  },
  activeNavButton: {
    borderBottomColor: '#667eea',
    backgroundColor: '#f8f9fa',
  },
  navText: {
    fontSize: 20,
    color: '#6c757d',
    marginBottom: 4,
  },
  activeNavText: {
    color: '#667eea',
  },
  navLabel: {
    fontSize: 10,
    color: '#6c757d',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 12,
    flexWrap: 'nowrap',
    flexShrink: 1,
  },
  activeNavLabel: {
    color: '#667eea',
    fontWeight: '700',
    flexWrap: 'nowrap',
    flexShrink: 1,
  },
  content: {
    flex: 1,
  },
  dashboard: {
    padding: 16,
    gap: 16,
  },
  welcomeCard: {
    backgroundColor: '#667eea',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 5,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.9,
    textAlign: 'center',
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f8f9fa',
    minHeight: 80,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 11,
    color: '#6c757d',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  people: {
    padding: 16,
    gap: 12,
  },
  budget: {
    padding: 16,
    gap: 16,
  },
  suggestions: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f8f9fa',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 12,
    flexWrap: 'nowrap',
    flexShrink: 1,
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityText: {
    fontSize: 14,
    color: '#495057',
  },
  activityTime: {
    fontSize: 12,
    color: '#adb5bd',
  },
  emptyActivityText: {
    fontSize: 14,
    color: '#6c757d',
    fontStyle: 'italic',
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007bff',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 12,
  },
  stepText: {
    fontSize: 14,
    color: '#495057',
  },
  addButton: {
    backgroundColor: '#28a745',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 56,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  personCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f8f9fa',
    marginBottom: 12,
  },
  personHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  personAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    flexWrap: 'nowrap',
    flexShrink: 1,
  },
  personRelationship: {
    fontSize: 14,
    color: '#6c757d',
    flexWrap: 'nowrap',
    flexShrink: 1,
  },
  personDate: {
    fontSize: 12,
    color: '#adb5bd',
  },
  aboutSection: {
    marginBottom: 15,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
  },
  aboutLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aboutText: {
    fontSize: 14,
    color: '#495057',
    lineHeight: 20,
  },
  contactSection: {
    marginTop: 5,
  },
  contactText: {
    fontSize: 12,
    color: '#6c757d',
  },
  personActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: '#667eea',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#dc3545',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 24,
  },
  budgetInput: {
    height: 56,
    borderWidth: 2,
    borderColor: '#e9ecef',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#ffffff',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  budgetText: {
    fontSize: 16,
    color: '#495057',
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#6c757d',
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212529',
  },
  suggestionText: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 15,
    lineHeight: 20,
  },
  suggestionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  personName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
  },
  statusAccepted: {
    backgroundColor: '#d4edda',
  },
  statusRejected: {
    backgroundColor: '#f8d7da',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  suggestionName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 8,
  },
  suggestionPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#28a745',
    marginBottom: 8,
  },
  suggestionDescription: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 20,
    marginBottom: 16,
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  acceptButton: {
    backgroundColor: '#28a745',
    flex: 1,
  },
  rejectButton: {
    backgroundColor: '#dc3545',
    flex: 1,
  },
  buyButton: {
    backgroundColor: '#007bff',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#212529',
  },
  closeButton: {
    fontSize: 28,
    color: '#6c757d',
    fontWeight: 'bold',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    textAlign: 'center',
    lineHeight: 40,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalFooter: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dateInputContainer: {
    marginBottom: 15,
    width: '100%',
  },
  dateLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateFieldsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 5,
  },
  dateInput: {
    flex: 0.28,
    height: 56,
    borderWidth: 0,
    borderRadius: 16,
    paddingHorizontal: 6,
    fontSize: 14,
    backgroundColor: '#ffffff',
    marginHorizontal: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    textAlign: 'center',
    minWidth: 50,
  },
  dateSeparator: {
    fontSize: 16,
    color: '#6c757d',
    fontWeight: '600',
    marginHorizontal: 2,
    flex: 0.08,
    textAlign: 'center',
  },
  disabledButton: {
    backgroundColor: '#e9ecef',
  },
  pendingIndicator: {
    backgroundColor: '#667eea',
    padding: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  pendingSuggestionText: {
    fontSize: 12,
    color: '#6c757d',
    fontStyle: 'italic',
  },
  acceptedIndicator: {
    backgroundColor: '#28a745',
    padding: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptedText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  acceptedSuggestion: {
    borderColor: '#28a745',
    borderWidth: 2,
    backgroundColor: '#f8fff9',
  },
  rejectedSuggestion: {
    borderColor: '#dc3545',
    borderWidth: 2,
    backgroundColor: '#fff8f8',
    opacity: 0.7,
  },
  newSuggestionButton: {
    backgroundColor: '#17a2b8',
  },
  warningCard: {
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  warningText: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 10,
  },
  budgetWarning: {
    backgroundColor: '#ffc107',
    padding: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetWarningText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  secondaryButton: {
    backgroundColor: '#6c757d',
    padding: 12,
    borderRadius: 8,
  },
  debugSection: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 10,
  },
  debugText: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#212529',
    marginTop: 10,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 24,
  },
  suggestionsList: {
    padding: 16,
  },
  clearButton: {
    backgroundColor: '#6c757d',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  enableButton: {
    backgroundColor: '#28a745',
  },
  disableButton: {
    backgroundColor: '#e9ecef',
  },
});

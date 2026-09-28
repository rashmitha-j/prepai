#include <bits/stdc++.h>
using namespace std;
int main(){string s;cin>>s;vector<char>st;for(char c:s){if(c=='('||c=='['||c=='{')st.push_back(c);else{if(st.empty()){cout<<"false\n";return 0;}char o=st.back();st.pop_back();if((c==')'&&o!='(')||(c==']'&&o!='[')||(c=='}'&&o!='{')){cout<<"false\n";return 0;}}}cout<<(st.empty()?"true":"false")<<"\n";}
